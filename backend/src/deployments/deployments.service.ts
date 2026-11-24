// Servico orquestrador do fluxo completo de deploy, rollback em 1 clique e leitura de logs.
// Conecta: Banco (Prisma) + Segredos (EnvService) + GitHub Actions + VPS (DeployProvider).

import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DeploymentStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ApplicationsService } from '../applications/applications.service';
import { EnvService } from '../env/env.service';
import { GitHubActionsService } from '../github/github-actions.service';
import {
  DEPLOY_PROVIDER,
  DeployProvider,
} from '../infra/deploy-provider.interface';
import { PrismaService } from '../prisma/prisma.service';

// Estados que indicam um deploy ainda em execucao (usados no controle de concorrencia)
const ACTIVE_STATUSES: DeploymentStatus[] = [
  DeploymentStatus.QUEUED,
  DeploymentStatus.BUILDING,
  DeploymentStatus.DEPLOYING,
];

@Injectable()
export class DeploymentsService {
  private readonly logger = new Logger(DeploymentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly applicationsService: ApplicationsService,
    private readonly envService: EnvService,
    private readonly gitHubActionsService: GitHubActionsService,
    @Inject(DEPLOY_PROVIDER) private readonly deployProvider: DeployProvider,
  ) {}

  // ==========================================================================
  // FLUXO PRINCIPAL (Passos 1 a 8): Dispara novo deploy completo via GitHub Actions
  // ==========================================================================
  async triggerDeploy(applicationId: string, userId: string) {
    const app = await this.applicationsService.findEntityOrThrow(applicationId);

    // Regra obrigatoria: bloqueia deploy simultaneo no mesmo projeto para evitar conflito no container
    await this.assertNoActiveDeployment(applicationId);

    // Gera o UUID antes de gravar para ja montar a tag imutavel no GHCR (deploy-<shortId>)
    const deployId = randomUUID();
    const imageTag = this.gitHubActionsService.buildImageTag(
      app.repoOwner,
      app.repoName,
      deployId,
    );

    const deployment = await this.prisma.deployment.create({
      data: {
        id: deployId,
        applicationId: app.id,
        triggeredById: userId,
        imageTag,
        status: DeploymentStatus.QUEUED,
        isRollback: false,
      },
    });

    // Executa o ciclo longo (Actions + polling + SSH/Docker) em segundo plano
    // para responder HTTP 202 imediatamente ao Frontend, que acompanha o progresso via polling.
    void this.runFullDeployPipeline(app, deployment.id, imageTag);

    return {
      message: 'Deploy iniciado e colocado na fila.',
      deployment,
    };
  }

  // ==========================================================================
  // FLUXO AUXILIAR A (Tela 5): Rollback em 1 clique usando tag anterior do GHCR
  // Pula os Passos 3 a 6 (NAO aciona GitHub Actions) e vai direto para SFTP + SSH/Docker
  // ==========================================================================
  async rollback(
    applicationId: string,
    targetDeploymentId: string,
    userId: string,
  ) {
    const app = await this.applicationsService.findEntityOrThrow(applicationId);
    await this.assertNoActiveDeployment(applicationId);

    // Valida que a versao alvo pertence a este projeto e foi concluida com sucesso
    const targetDeployment = await this.prisma.deployment.findFirst({
      where: {
        id: targetDeploymentId,
        applicationId,
      },
    });

    if (!targetDeployment) {
      throw new NotFoundException('Deploy de destino não encontrado neste projeto.');
    }

    if (
      targetDeployment.status !== DeploymentStatus.COMPLETED &&
      targetDeployment.status !== DeploymentStatus.ONLINE
    ) {
      throw new BadRequestException(
        'Só é possível fazer rollback para uma versão concluída com sucesso.',
      );
    }

    // Registra o novo evento de rollback no historico ja em status DEPLOYING
    const rollbackDeployment = await this.prisma.deployment.create({
      data: {
        applicationId: app.id,
        triggeredById: userId,
        imageTag: targetDeployment.imageTag,
        status: DeploymentStatus.DEPLOYING,
        isRollback: true,
      },
    });

    // Reaplica a tag estavel na VPS em segundo plano (leva poucos segundos)
    void this.runVpsPublishOnly(app, rollbackDeployment.id, targetDeployment.imageTag);

    return {
      message: `Rollback iniciado para a imagem ${targetDeployment.imageTag}.`,
      deployment: rollbackDeployment,
    };
  }

  // ==========================================================================
  // TELA 5 (Aba Historico): Lista todos os deploys do mais recente para o mais antigo
  // ==========================================================================
  async listHistory(applicationId: string) {
    await this.applicationsService.findEntityOrThrow(applicationId);

    const deployments = await this.prisma.deployment.findMany({
      where: { applicationId },
      orderBy: { startedAt: 'desc' },
      include: {
        triggeredBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    return deployments.map((d) => ({
      ...d,
      // Flag pronta para o Frontend saber em quais linhas exibir o botao "Restaurar Versao"
      canRollback: d.status === DeploymentStatus.COMPLETED,
    }));
  }

  // Consulta o status detalhado de um deploy especifico (usado na barra de progresso da Tela 4)
  async findOne(applicationId: string, deploymentId: string) {
    const deployment = await this.prisma.deployment.findFirst({
      where: {
        id: deploymentId,
        applicationId,
      },
      include: {
        triggeredBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!deployment) {
      throw new NotFoundException('Deploy não encontrado.');
    }

    return deployment;
  }

  // ==========================================================================
  // FLUXO AUXILIAR B (Tela 6): Visualizador de Logs do Container via SSH
  // ==========================================================================
  async getLogs(applicationId: string, tail = 100) {
    const app = await this.applicationsService.findEntityOrThrow(applicationId);
    const logs = await this.deployProvider.getLogs({
      slug: app.slug,
      tail,
    });

    return {
      applicationId: app.id,
      slug: app.slug,
      tail,
      logs,
      fetchedAt: new Date().toISOString(),
    };
  }

  // --------------------------------------------------------------------------
  // Rotina assincrona do fluxo completo: Actions -> Polling -> SFTP .env -> Docker
  // --------------------------------------------------------------------------
  private async runFullDeployPipeline(
    app: {
      id: string;
      slug: string;
      repoOwner: string;
      repoName: string;
      branch: string;
      workflowFile: string;
      internalPort: number;
      externalPort: number;
      domain: string | null;
    },
    deploymentId: string,
    imageTag: string,
  ) {
    try {
      const triggeredAt = new Date();

      // Passo 3: Dispara o workflow_dispatch no GitHub Actions
      await this.gitHubActionsService.triggerWorkflowDispatch({
        repoOwner: app.repoOwner,
        repoName: app.repoName,
        workflowFile: app.workflowFile,
        branch: app.branch,
        deployId: deploymentId,
      });

      // Passos 4, 5 e 6: Aguarda testes, build Docker e push no GHCR via polling
      await this.gitHubActionsService.waitForWorkflowCompletion({
        repoOwner: app.repoOwner,
        repoName: app.repoName,
        workflowFile: app.workflowFile,
        branch: app.branch,
        triggeredAt,
        onBuilding: async () => {
          await this.prisma.deployment.update({
            where: { id: deploymentId },
            data: { status: DeploymentStatus.BUILDING },
          });
        },
      });

      // Passos 7 e 8: Muda para DEPLOYING, envia .env via SFTP e publica container na VPS
      await this.prisma.deployment.update({
        where: { id: deploymentId },
        data: { status: DeploymentStatus.DEPLOYING },
      });

      await this.publishContainerAndFinalize(app, deploymentId, imageTag);
    } catch (error) {
      await this.markDeploymentFailed(deploymentId, error);
    }
  }

  // Rotina assincrona usada no Rollback (pula GitHub Actions, executa direto Passos 7 e 8)
  private async runVpsPublishOnly(
    app: {
      id: string;
      slug: string;
      internalPort: number;
      externalPort: number;
      domain: string | null;
    },
    deploymentId: string,
    imageTag: string,
  ) {
    try {
      await this.publishContainerAndFinalize(app, deploymentId, imageTag);
    } catch (error) {
      await this.markDeploymentFailed(deploymentId, error);
    }
  }

  // Passo 7 e 8 compartilhados por Deploy normal e Rollback
  private async publishContainerAndFinalize(
    app: {
      id: string;
      slug: string;
      internalPort: number;
      externalPort: number;
      domain: string | null;
    },
    deploymentId: string,
    imageTag: string,
  ) {
    // Descriptografa as variaveis APENAS em memoria RAM no instante do deploy
    const envFileContent = await this.envService.getDecryptedEnvFileContent(app.id);

    // Envia .env via SFTP (chmod 600), faz docker pull e substitui o container
    await this.deployProvider.deploy({
      slug: app.slug,
      imageTag,
      internalPort: app.internalPort,
      externalPort: app.externalPort,
      envFileContent,
      domain: app.domain,
    });

    // Transacao atomica: rebaixa o deploy ONLINE anterior para COMPLETED (historico de rollback)
    // e promove o deploy atual para ONLINE.
    await this.prisma.$transaction([
      this.prisma.deployment.updateMany({
        where: {
          applicationId: app.id,
          status: DeploymentStatus.ONLINE,
          id: { not: deploymentId },
        },
        data: { status: DeploymentStatus.COMPLETED },
      }),
      this.prisma.deployment.update({
        where: { id: deploymentId },
        data: {
          status: DeploymentStatus.ONLINE,
          finishedAt: new Date(),
          errorMessage: null,
        },
      }),
    ]);

    this.logger.log(`Deploy ${deploymentId} da app "${app.slug}" está ONLINE!`);
  }

  // Grava erro de forma segura (sem expor segredos) e encerra o estado do deploy como FAILED
  private async markDeploymentFailed(deploymentId: string, error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Erro inesperado durante o processo de deploy.';

    this.logger.error(`Deploy ${deploymentId} falhou: ${message}`);

    await this.prisma.deployment.update({
      where: { id: deploymentId },
      data: {
        status: DeploymentStatus.FAILED,
        errorMessage: message.slice(0, 1000),
        finishedAt: new Date(),
      },
    });
  }

  // Impede dois deploys ou rollbacks simultaneos na mesma aplicacao
  private async assertNoActiveDeployment(applicationId: string) {
    const active = await this.prisma.deployment.findFirst({
      where: {
        applicationId,
        status: { in: ACTIVE_STATUSES },
      },
      select: { id: true, status: true },
    });

    if (active) {
      throw new ConflictException(
        `Já existe um deploy em andamento (${active.status}) para este projeto. Aguarde concluir.`,
      );
    }
  }
}
