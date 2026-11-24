// Implementacao oficial do DeployProvider usando SSH e SFTP (Passos 7 e 8 da especificacao).
// Boas praticas obrigatorias aplicadas aqui:
// 1) NUNCA injeta variaveis via "docker run -e" (evita vazamento em ps aux / historico do shell);
// 2) Envia o arquivo .env via SFTP em pasta isolada com permissao restrita chmod 600;
// 3) Sobe os containers numa rede Docker nomeada (fullfast-net) e com labels padrao (pronto pro Pos-MVP);
// 4) Valida slug e imageTag antes de montar comandos remotos (prevencao contra command injection).

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { readFileSync } from 'fs';
import { Client, ConnectConfig, SFTPWrapper } from 'ssh2';
import {
  DeployContainerParams,
  DeployProvider,
  LogsParams,
  RemoveContainerParams,
} from './deploy-provider.interface';

@Injectable()
export class SshDockerDeployProvider implements DeployProvider {
  private readonly logger = new Logger(SshDockerDeployProvider.name);

  constructor(private readonly configService: ConfigService) {}

  // Passos 7 e 8 do fluxo: grava .env restrito via SFTP, baixa imagem do GHCR e sobe o container
  async deploy(params: DeployContainerParams): Promise<void> {
    this.assertSafeSlug(params.slug);
    this.assertSafeImageTag(params.imageTag);

    const appsDir = this.configService.get<string>('VPS_APPS_DIR', '/opt/terabits/apps');
    const dockerNetwork = this.configService.get<string>('VPS_DOCKER_NETWORK', 'fullfast-net');
    const appDir = `${appsDir}/${params.slug}`;
    const remoteEnvPath = `${appDir}/.env`;

    await this.withSshConnection(async (client) => {
      // 1. Garante a pasta isolada da aplicacao na VPS com permissao restrita (chmod 700)
      await this.execCommand(client, `mkdir -p "${appDir}" && chmod 700 "${appDir}"`);

      // 2. Transfere o arquivo .env via SFTP diretamente da memoria RAM e aplica chmod 600
      await this.uploadEnvFileSecurely(client, remoteEnvPath, params.envFileContent);

      // 3. Garante que a rede Docker nomeada (Encaixe Pos-MVP #4) existe antes do docker run
      await this.execCommand(
        client,
        `docker network inspect ${dockerNetwork} >/dev/null 2>&1 || docker network create ${dockerNetwork}`,
      );

      // 4. Baixa a imagem versionada exata do GHCR
      this.logger.log(`Baixando imagem ${params.imageTag} na VPS para "${params.slug}"...`);
      await this.execCommand(client, `docker pull ${params.imageTag}`);

      // 5. Encerra e remove o container da versao anterior (se existir)
      await this.execCommand(client, `docker rm -f ${params.slug} || true`);

      // 6. Monta o comando docker run usando --env-file (nunca -e!), rede nomeada e labels padrao
      const labels = [
        '--label fullfast.managed=true',
        `--label fullfast.app=${params.slug}`,
      ];

      // Gancho Pos-MVP (Traefik): se o projeto tiver dominio configurado, adiciona labels automaticas
      if (params.domain) {
        this.assertSafeDomain(params.domain);
        labels.push(
          '--label traefik.enable=true',
          `--label "traefik.http.routers.${params.slug}.rule=Host(\`${params.domain}\`)"`,
          `--label traefik.http.services.${params.slug}.loadbalancer.server.port=${params.internalPort}`,
        );
      }

      const runCmd = [
        'docker run -d',
        `--name ${params.slug}`,
        '--restart unless-stopped',
        `--network ${dockerNetwork}`,
        `--env-file "${remoteEnvPath}"`,
        `-p ${params.externalPort}:${params.internalPort}`,
        ...labels,
        params.imageTag,
      ].join(' ');

      await this.execCommand(client, runCmd);
      this.logger.log(
        `Container "${params.slug}" publicado na porta externa ${params.externalPort}.`,
      );
    });
  }

  // Fluxo Auxiliar B (Tela 6): le as ultimas N linhas de stdout/stderr do container via SSH
  async getLogs(params: LogsParams): Promise<string> {
    this.assertSafeSlug(params.slug);
    const safeTail = Math.min(Math.max(Math.floor(params.tail || 100), 10), 1000);

    return this.withSshConnection(async (client) => {
      // Checa primeiro se o container existe para devolver mensagem amigavel caso nunca tenha sido publicado
      const exists = await this.execCommand(
        client,
        `docker ps -a --format '{{.Names}}' | grep -x "${params.slug}" || true`,
      );

      if (!exists.trim()) {
        return 'Container ainda não foi publicado ou foi removido da VPS.';
      }

      // Redireciona stderr (2>&1) para trazer erros da aplicacao junto com a saida padrao
      return this.execCommand(client, `docker logs --tail ${safeTail} ${params.slug} 2>&1`);
    });
  }

  // Chamado ao excluir um projeto na Tela 4 (Aba Configuracoes): limpa container e .env na VPS
  async remove(params: RemoveContainerParams): Promise<void> {
    this.assertSafeSlug(params.slug);
    const appsDir = this.configService.get<string>('VPS_APPS_DIR', '/opt/terabits/apps');
    const appDir = `${appsDir}/${params.slug}`;

    await this.withSshConnection(async (client) => {
      await this.execCommand(client, `docker rm -f ${params.slug} || true`);
      await this.execCommand(client, `rm -rf "${appDir}"`);
    });
  }

  // Abre conexao SSH usando as credenciais do .env, executa a operacao e garante client.end() no final
  private async withSshConnection<T>(
    operation: (client: Client) => Promise<T>,
  ): Promise<T> {
    const config = this.buildSshConfig();
    const client = new Client();

    await new Promise<void>((resolve, reject) => {
      client
        .once('ready', () => resolve())
        .once('error', (err) =>
          reject(
            new InternalServerErrorException(
              `Falha ao conectar via SSH na VPS (${config.host}:${config.port}): ${err.message}`,
            ),
          ),
        )
        .connect(config);
    });

    try {
      return await operation(client);
    } finally {
      client.end();
    }
  }

  // Le host, porta, usuario e chave privada SSH apenas de variaveis de ambiente (nunca hardcoded)
  private buildSshConfig(): ConnectConfig {
    const host = this.configService.get<string>('VPS_HOST', 'localhost');
    const port = Number(this.configService.get<string>('VPS_PORT', '2222'));
    const username = this.configService.get<string>('VPS_USER', 'terabits');
    const privateKeyPath = this.configService.get<string>('VPS_PRIVATE_KEY_PATH');

    if (!privateKeyPath) {
      throw new InternalServerErrorException(
        'VPS_PRIVATE_KEY_PATH não configurado no .env da API.',
      );
    }

    let privateKey: Buffer;
    try {
      privateKey = readFileSync(privateKeyPath);
    } catch (error) {
      throw new InternalServerErrorException(
        `Não foi possível ler a chave privada SSH em "${privateKeyPath}": ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return {
      host,
      port,
      username,
      privateKey,
      readyTimeout: 15_000, // Timeout de 15s para nao travar requisicoes se a VPS estiver fora
    };
  }

  // Grava o conteudo do .env via SFTP e aplica chmod 600 (somente dono pode ler/escrever)
  private async uploadEnvFileSecurely(
    client: Client,
    remotePath: string,
    content: string,
  ): Promise<void> {
    const sftp = await new Promise<SFTPWrapper>((resolve, reject) => {
      client.sftp((err, sftpStream) => {
        if (err) return reject(err);
        resolve(sftpStream);
      });
    });

    await new Promise<void>((resolve, reject) => {
      const writeStream = sftp.createWriteStream(remotePath, { mode: 0o600 });
      writeStream.once('error', reject);
      writeStream.once('close', () => resolve());
      writeStream.end(content, 'utf8');
    });

    // Reforca explicitamente chmod 600 mesmo se o arquivo ja existia antes
    await new Promise<void>((resolve, reject) => {
      sftp.chmod(remotePath, 0o600, (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  }

  // Executa um comando remoto na VPS e rejeita caso o codigo de saida seja diferente de 0
  private execCommand(client: Client, command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      client.exec(command, (err, stream) => {
        if (err) return reject(err);

        let stdout = '';
        let stderr = '';

        stream.on('data', (chunk: Buffer) => {
          stdout += chunk.toString('utf8');
        });
        stream.stderr.on('data', (chunk: Buffer) => {
          stderr += chunk.toString('utf8');
        });
        stream.on('close', (code: number) => {
          if (code !== 0) {
            return reject(
              new InternalServerErrorException(
                `Comando remoto falhou (código ${code}): ${stderr.trim() || stdout.trim()}`,
              ),
            );
          }
          resolve(stdout);
        });
      });
    });
  }

  // Validacoes defensivas contra injecao de comando no shell remoto
  private assertSafeSlug(slug: string) {
    if (!/^[a-z0-9][a-z0-9-]{0,50}$/.test(slug)) {
      throw new BadRequestException(`Slug inválido para container Docker: "${slug}".`);
    }
  }

  private assertSafeImageTag(imageTag: string) {
    if (!/^[a-z0-9./:_-]+$/i.test(imageTag)) {
      throw new BadRequestException(`Tag de imagem Docker inválida: "${imageTag}".`);
    }
  }

  private assertSafeDomain(domain: string) {
    if (!/^[a-z0-9.-]+$/i.test(domain)) {
      throw new BadRequestException(`Domínio inválido para Traefik: "${domain}".`);
    }
  }
}
