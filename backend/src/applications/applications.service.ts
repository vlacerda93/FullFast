// Servico de gerenciamento de projetos (Telas 2, 3 e 4).
// Responsabilidades criticas do Passo 2 da especificacao:
// 1) Gerar um slug seguro (letras minusculas, numeros e hifen) para nomear o container e a pasta .env;
// 2) Alocar automaticamente uma porta externa livre dentro da faixa enxuta (4000-4020);
// 3) Montar a URL de acesso (http://localhost:<PORTA> no MVP ou https://<domain> no Pos-MVP);
// 4) Ao excluir o projeto, limpar tambem o container e o .env na VPS via DeployProvider.

import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeploymentStatus } from '@prisma/client';
import { EnvService } from '../env/env.service';
import {
  DEPLOY_PROVIDER,
  DeployProvider,
} from '../infra/deploy-provider.interface';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@Injectable()
export class ApplicationsService {
  private readonly logger = new Logger(ApplicationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    private readonly envService: EnvService,
    // Injecao via interface (Encaixe Pos-MVP #1): este servico nao sabe se o deploy e SSH ou Traefik
    @Inject(DEPLOY_PROVIDER) private readonly deployProvider: DeployProvider,
  ) {}

  // Cadastra uma nova aplicacao, gera slug unico, aloca porta livre e salva variaveis iniciais (se houver)
  async create(dto: CreateApplicationDto) {
    const slug = await this.generateUniqueSlug(dto.name);
    const externalPort = await this.allocateFreePort();

    if (dto.domain) {
      const existingDomain = await this.prisma.application.findUnique({
        where: { domain: dto.domain.trim().toLowerCase() },
      });
      if (existingDomain) {
        throw new ConflictException('Este domínio já está em uso por outro projeto.');
      }
    }

    const application = await this.prisma.application.create({
      data: {
        name: dto.name.trim(),
        slug,
        repoOwner: dto.repoOwner.trim(),
        repoName: dto.repoName.trim(),
        branch: dto.branch?.trim() || 'main',
        workflowFile: dto.workflowFile?.trim() || 'deploy.yml',
        internalPort: dto.internalPort,
        externalPort,
        domain: dto.domain?.trim().toLowerCase() || null,
        autoDeploy: dto.autoDeploy ?? false,
      },
    });

    // Se o usuario ja preencheu variaveis de ambiente no cadastro (Tela 3), criptografa e salva cada uma
    if (dto.envVariables && dto.envVariables.length > 0) {
      for (const envVar of dto.envVariables) {
        await this.envService.upsert(application.id, envVar);
      }
    }

    return this.formatApplicationResponse(application, null);
  }

  // Lista todos os projetos para o Dashboard (Tela 2), com busca por nome e filtro opcional por status
  async findAll(search?: string, statusFilter?: string) {
    const apps = await this.prisma.application.findMany({
      where: search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { repoName: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
            ],
          }
        : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        // Busca apenas o deploy mais recente para mostrar o status atual na tabela do Dashboard
        deployments: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    const formatted = apps.map((app) =>
      this.formatApplicationResponse(app, app.deployments[0] ?? null),
    );

    // Filtro opcional por status ("NOT_DEPLOYED", "ONLINE", "BUILDING", "FAILED", etc.)
    if (statusFilter && statusFilter.toUpperCase() !== 'ALL') {
      const target = statusFilter.toUpperCase();
      return formatted.filter((item) => item.currentStatus === target);
    }

    return formatted;
  }

  // Retorna detalhes completos de um projeto (Tela 4)
  async findOne(id: string) {
    const app = await this.prisma.application.findUnique({
      where: { id },
      include: {
        deployments: {
          orderBy: { startedAt: 'desc' },
          take: 1,
          include: {
            triggeredBy: { select: { id: true, name: true, email: true } },
          },
        },
        _count: {
          select: { envVariables: true, deployments: true },
        },
      },
    });

    if (!app) {
      throw new NotFoundException('Projeto não encontrado.');
    }

    return {
      ...this.formatApplicationResponse(app, app.deployments[0] ?? null),
      envVariablesCount: app._count.envVariables,
      totalDeployments: app._count.deployments,
    };
  }

  // Metodo interno usado por DeploymentsService para carregar a entidade pura do banco
  async findEntityOrThrow(id: string) {
    const app = await this.prisma.application.findUnique({ where: { id } });
    if (!app) {
      throw new NotFoundException('Projeto não encontrado.');
    }
    return app;
  }

  // Atualiza configuracoes do projeto (Aba Configuracoes — Tela 4)
  async update(id: string, dto: UpdateApplicationDto) {
    await this.findEntityOrThrow(id);

    const updated = await this.prisma.application.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.branch !== undefined && { branch: dto.branch.trim() }),
        ...(dto.workflowFile !== undefined && { workflowFile: dto.workflowFile.trim() }),
        ...(dto.internalPort !== undefined && { internalPort: dto.internalPort }),
        ...(dto.domain !== undefined && {
          domain: dto.domain ? dto.domain.trim().toLowerCase() : null,
        }),
        ...(dto.autoDeploy !== undefined && { autoDeploy: dto.autoDeploy }),
      },
      include: {
        deployments: { orderBy: { startedAt: 'desc' }, take: 1 },
      },
    });

    return this.formatApplicationResponse(updated, updated.deployments[0] ?? null);
  }

  // Exclui o projeto no banco E remove container + arquivo .env correspondentes na VPS
  async remove(id: string) {
    const app = await this.findEntityOrThrow(id);

    // Tenta limpar container e .env na VPS; se a VPS estiver offline no ambiente de teste,
    // registra aviso mas nao trava a exclusao do registro no banco.
    try {
      await this.deployProvider.remove({ slug: app.slug });
    } catch (error) {
      this.logger.warn(
        `Não foi possível limpar o container "${app.slug}" na VPS durante a exclusão: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await this.prisma.application.delete({ where: { id } });

    return {
      deleted: true,
      id: app.id,
      slug: app.slug,
    };
  }

  // Monta o objeto padronizado exibido nas telas de Listagem e Detalhes
  formatApplicationResponse(
    app: {
      id: string;
      name: string;
      slug: string;
      repoOwner: string;
      repoName: string;
      branch: string;
      workflowFile: string;
      internalPort: number;
      externalPort: number;
      domain: string | null;
      autoDeploy: boolean;
      createdAt: Date;
      updatedAt: Date;
    },
    lastDeployment: {
      id: string;
      imageTag: string;
      status: DeploymentStatus;
      isRollback: boolean;
      errorMessage: string | null;
      startedAt: Date;
      finishedAt: Date | null;
    } | null,
  ) {
    const publicBase = this.configService.get<string>(
      'VPS_PUBLIC_URL_BASE',
      'http://localhost',
    );

    // No MVP usa http://localhost:<PORTA>; no Pos-MVP com Traefik passa a usar https://<domain>
    const accessUrl = app.domain
      ? `https://${app.domain}`
      : `${publicBase}:${app.externalPort}`;

    return {
      id: app.id,
      name: app.name,
      slug: app.slug,
      repository: `${app.repoOwner}/${app.repoName}`,
      repoOwner: app.repoOwner,
      repoName: app.repoName,
      branch: app.branch,
      workflowFile: app.workflowFile,
      internalPort: app.internalPort,
      externalPort: app.externalPort,
      domain: app.domain,
      autoDeploy: app.autoDeploy,
      accessUrl,
      currentStatus: lastDeployment ? lastDeployment.status : 'NOT_DEPLOYED',
      lastDeployment,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
    };
  }

  // Converte "API Clientes!" -> "api-clientes" (seguro para nome de container Docker e pasta Linux)
  private async generateUniqueSlug(name: string): Promise<string> {
    const baseSlug =
      name
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove acentos
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Troca tudo que nao for letra/numero por hifen
        .replace(/^-+|-+$/g, '') // Remove hifens sobrando nas pontas
        .slice(0, 40) || 'app';

    let candidate = baseSlug;
    let suffix = 2;

    while (
      await this.prisma.application.findUnique({
        where: { slug: candidate },
        select: { id: true },
      })
    ) {
      candidate = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  // Procura a menor porta livre na faixa configurada (padrao: 4000 a 4020)
  private async allocateFreePort(): Promise<number> {
    const rangeStart = Number(this.configService.get<string>('PORT_RANGE_START', '4000'));
    const rangeEnd = Number(this.configService.get<string>('PORT_RANGE_END', '4020'));

    const usedApps = await this.prisma.application.findMany({
      select: { externalPort: true },
    });
    const usedPorts = new Set(usedApps.map((a) => a.externalPort));

    for (let port = rangeStart; port <= rangeEnd; port += 1) {
      if (!usedPorts.has(port)) {
        return port;
      }
    }

    throw new ConflictException(
      `Todas as portas disponíveis na faixa ${rangeStart}-${rangeEnd} já estão alocadas.`,
    );
  }
}
