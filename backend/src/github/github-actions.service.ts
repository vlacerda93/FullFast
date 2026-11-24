// Servico responsavel pelos Passos 3, 5 e 6 da especificacao:
// 1) Dispara a pipeline no repositorio via evento workflow_dispatch na API REST do GitHub;
// 2) Faz polling na API do GitHub ate detectar a conclusao do build e publicacao no GHCR;
// 3) Padroniza a tag imutavel da imagem Docker no GHCR (ghcr.io/<owner>/<repo>:deploy-<id>).

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface TriggerWorkflowParams {
  repoOwner: string;
  repoName: string;
  workflowFile: string;
  branch: string;
  deployId: string;
}

export interface PollWorkflowParams {
  repoOwner: string;
  repoName: string;
  workflowFile: string;
  branch: string;
  triggeredAt: Date;
  onBuilding?: () => Promise<void>;
}

interface GitHubWorkflowRun {
  id: number;
  status: string; // "queued" | "in_progress" | "completed"
  conclusion: string | null; // "success" | "failure" | "cancelled" | null
  created_at: string;
  html_url: string;
}

@Injectable()
export class GitHubActionsService {
  private readonly logger = new Logger(GitHubActionsService.name);
  private readonly apiBase = 'https://api.github.com';
  private readonly pollIntervalMs = 10_000; // Consulta o GitHub a cada 10 segundos (conforme spec)
  private readonly maxPollAttempts = 60; // Timeout total de 10 minutos (60 x 10s)

  constructor(private readonly configService: ConfigService) {}

  // Gera a tag imutavel da imagem no GHCR em letras minusculas (exigencia do padrao Docker/OCI)
  buildImageTag(repoOwner: string, repoName: string, deployId: string): string {
    const shortId = deployId.slice(0, 8).toLowerCase();
    return `ghcr.io/${repoOwner.toLowerCase()}/${repoName.toLowerCase()}:deploy-${shortId}`;
  }

  // Passo 3: Aciona o workflow_dispatch no repositorio, passando deploy_id como parametro
  // Obs.: A API do GitHub responde HTTP 204 (sem corpo e sem run_id) quando aceita o disparo.
  async triggerWorkflowDispatch(params: TriggerWorkflowParams): Promise<void> {
    const url = `${this.apiBase}/repos/${params.repoOwner}/${params.repoName}/actions/workflows/${params.workflowFile}/dispatches`;
    const shortTag = `deploy-${params.deployId.slice(0, 8).toLowerCase()}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        ref: params.branch,
        inputs: {
          deploy_id: shortTag,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new InternalServerErrorException(
        `Erro ao disparar GitHub Actions (${response.status}): ${errorText}`,
      );
    }

    this.logger.log(
      `Pipeline "${params.workflowFile}" disparada em ${params.repoOwner}/${params.repoName}@${params.branch} (${shortTag}).`,
    );
  }

  // Passo 6: Acompanha via polling o run recem-criado ate concluir (success ou failure)
  async waitForWorkflowCompletion(params: PollWorkflowParams): Promise<void> {
    let notifiedBuilding = false;
    // Margem de 5 segundos para compensar pequena diferenca de relogio entre a API local e o GitHub
    const minTimestamp = params.triggeredAt.getTime() - 5_000;

    for (let attempt = 1; attempt <= this.maxPollAttempts; attempt += 1) {
      await this.sleep(this.pollIntervalMs);

      const run = await this.findLatestDispatchedRun(params, minTimestamp);
      if (!run) {
        continue; // O GitHub ainda esta enfileirando o workflow recem-disparado
      }

      if (run.status === 'in_progress' && !notifiedBuilding) {
        notifiedBuilding = true;
        if (params.onBuilding) {
          await params.onBuilding();
        }
      }

      if (run.status === 'completed') {
        if (run.conclusion === 'success') {
          this.logger.log(`Workflow run #${run.id} concluído com sucesso no GitHub Actions.`);
          return;
        }

        throw new InternalServerErrorException(
          `A pipeline do GitHub Actions falhou (conclusão: ${run.conclusion ?? 'desconhecida'}). Veja detalhes em: ${run.html_url}`,
        );
      }
    }

    throw new InternalServerErrorException(
      'Tempo limite excedido aguardando conclusão do build no GitHub Actions (10 min).',
    );
  }

  // Busca as execucoes recentes disparadas por workflow_dispatch na branch informada
  private async findLatestDispatchedRun(
    params: PollWorkflowParams,
    minTimestamp: number,
  ): Promise<GitHubWorkflowRun | null> {
    const query = new URLSearchParams({
      branch: params.branch,
      event: 'workflow_dispatch',
      per_page: '10',
    });

    const url = `${this.apiBase}/repos/${params.repoOwner}/${params.repoName}/actions/workflows/${params.workflowFile}/runs?${query.toString()}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.buildHeaders(),
    });

    if (!response.ok) {
      this.logger.warn(
        `Falha temporária no polling do GitHub (${response.status}); tentando novamente...`,
      );
      return null;
    }

    const body = (await response.json()) as { workflow_runs?: GitHubWorkflowRun[] };
    const runs = body.workflow_runs ?? [];

    // Correlaciona pelo horario de criacao posterior ao disparo feito pela nossa API
    return (
      runs.find((run) => new Date(run.created_at).getTime() >= minTimestamp) ?? null
    );
  }

  // Cabecalhos padrao da API REST do GitHub com token restrito lido do .env
  private buildHeaders(): Record<string, string> {
    const token = this.configService.get<string>('GITHUB_TOKEN');
    if (!token) {
      throw new InternalServerErrorException(
        'GITHUB_TOKEN não configurado no .env da API.',
      );
    }

    return {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
