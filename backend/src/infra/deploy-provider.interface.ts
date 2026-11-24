// Contrato (interface) do motor de deploy — Encaixe Pos-MVP #1.
// Os servicos de negocio (ApplicationsService e DeploymentsService) dependem APENAS desta interface.
// Hoje ela e implementada por SshDockerDeployProvider (Docker via SSH/SFTP na VPS).
// Se no futuro a Terabits evoluir a forma de publicar containers, basta trocar a implementacao no InfraModule.

export const DEPLOY_PROVIDER = 'DEPLOY_PROVIDER';

export interface DeployContainerParams {
  slug: string; // Nome seguro do container e da pasta na VPS (ex.: "finup-api")
  imageTag: string; // Tag imutavel no GHCR (ex.: "ghcr.io/terabits/finup-api:deploy-abc12345")
  internalPort: number; // Porta onde o app escuta dentro do container (ex.: 3000)
  externalPort: number; // Porta alocada no host/VPS (faixa 4000-4020)
  envFileContent: string; // Conteudo do arquivo .env descriptografado em RAM (jamais logar!)
  domain?: string | null; // Gancho Pos-MVP: quando preenchido, ativa labels do Traefik automaticamente
}

export interface LogsParams {
  slug: string;
  tail: number; // Quantidade de linhas finais (ex.: 100, 200, 500)
}

export interface RemoveContainerParams {
  slug: string;
}

export interface DeployProvider {
  // Envia .env via SFTP (chmod 600), faz docker pull e substitui o container em execucao
  deploy(params: DeployContainerParams): Promise<void>;

  // Executa docker logs na VPS para a Tela 6 (Visualizador de Logs)
  getLogs(params: LogsParams): Promise<string>;

  // Encerra/remove o container e apaga a pasta .env correspondente na VPS
  remove(params: RemoveContainerParams): Promise<void>;
}
