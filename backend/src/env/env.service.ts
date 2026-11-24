// Servico de gerenciamento das variaveis de ambiente dos projetos.
// Regra de ouro de seguranca: rotas HTTP SEMPRE retornam o valor mascarado ("••••••••").
// O valor real so e descriptografado internamente em memoria no momento do deploy (SFTP).

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpsertEnvDto } from './dto/upsert-env.dto';
import { SecretsService } from './secrets.service';

const MASKED_VALUE = '••••••••';

@Injectable()
export class EnvService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsService: SecretsService,
  ) {}

  // Lista todas as chaves cadastradas de um projeto com os valores ocultos por mascara (Tela 4)
  async listMasked(applicationId: string) {
    await this.ensureApplicationExists(applicationId);

    const variables = await this.prisma.envVariable.findMany({
      where: { applicationId },
      orderBy: { envKey: 'asc' },
      select: {
        id: true,
        envKey: true,
        updatedAt: true,
      },
    });

    return {
      notice:
        'Alterações nas variáveis de ambiente entram em vigor somente após realizar um novo deploy.',
      items: variables.map((v) => ({
        id: v.id,
        envKey: v.envKey,
        value: MASKED_VALUE,
        updatedAt: v.updatedAt,
      })),
    };
  }

  // Cria uma nova variavel ou atualiza o valor de uma chave existente, criptografando com AES-256-GCM
  async upsert(applicationId: string, dto: UpsertEnvDto) {
    await this.ensureApplicationExists(applicationId);

    // Criptografa antes de tocar no banco de dados
    const encrypted = this.secretsService.encrypt(dto.value);

    const saved = await this.prisma.envVariable.upsert({
      where: {
        applicationId_envKey: {
          applicationId,
          envKey: dto.envKey,
        },
      },
      create: {
        applicationId,
        envKey: dto.envKey,
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      update: {
        encryptedValue: encrypted.encryptedValue,
        iv: encrypted.iv,
        authTag: encrypted.authTag,
      },
      select: {
        id: true,
        envKey: true,
        updatedAt: true,
      },
    });

    return {
      ...saved,
      value: MASKED_VALUE,
      notice:
        'Variável salva criptografada. Realize um novo deploy para aplicar a alteração no container.',
    };
  }

  // Remove uma variavel de ambiente pelo nome da chave
  async remove(applicationId: string, envKey: string) {
    await this.ensureApplicationExists(applicationId);

    const existing = await this.prisma.envVariable.findUnique({
      where: {
        applicationId_envKey: {
          applicationId,
          envKey,
        },
      },
    });

    if (!existing) {
      throw new NotFoundException(`Variável "${envKey}" não encontrada neste projeto.`);
    }

    await this.prisma.envVariable.delete({
      where: { id: existing.id },
    });

    return {
      deleted: true,
      envKey,
      notice: 'Variável removida. Faça um novo deploy para atualizar o container.',
    };
  }

  // Metodo INTERNO (nao exposto em nenhum Controller HTTP!):
  // Descriptografa as variaveis exclusivamente na RAM para montar o arquivo .env enviado via SFTP.
  async getDecryptedEnvFileContent(applicationId: string): Promise<string> {
    const records = await this.prisma.envVariable.findMany({
      where: { applicationId },
      orderBy: { envKey: 'asc' },
    });

    const decryptedEntries = records.map((record) => ({
      key: record.envKey,
      value: this.secretsService.decrypt({
        encryptedValue: record.encryptedValue,
        iv: record.iv,
        authTag: record.authTag,
      }),
    }));

    return this.secretsService.formatEnvFile(decryptedEntries);
  }

  private async ensureApplicationExists(applicationId: string) {
    const app = await this.prisma.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });

    if (!app) {
      throw new NotFoundException('Projeto não encontrado.');
    }
  }
}
