// Servico centralizado de criptografia das variaveis de ambiente (Encaixe Pos-MVP #3).
// Toda criptografia/descriptografia passa por aqui usando AES-256-GCM nativo do Node.js.
// Se no futuro a Terabits migrar para HashiCorp Vault ou outro cofre, apenas este servico muda.

import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface EncryptedPayload {
  encryptedValue: string; // Valor cifrado em hexadecimal
  iv: string; // Vetor de inicializacao (12 bytes em hex), unico por criptografia
  authTag: string; // Tag de autenticidade (16 bytes em hex) que detecta qualquer adulteracao
}

@Injectable()
export class SecretsService {
  // Algoritmo oficial exigido na especificacao: AES 256 bits no modo autenticado GCM
  private readonly algorithm = 'aes-256-gcm';
  // 12 bytes (96 bits) e o tamanho padrao recomendado pelo NIST para o IV no modo GCM
  private readonly ivLengthBytes = 12;
  private readonly masterKey: Buffer;

  constructor(private readonly configService: ConfigService) {
    const keyHex = this.configService.get<string>('ENCRYPTION_KEY') ?? '';

    // Valida na inicializacao: 32 bytes em hexadecimal = exatamente 64 caracteres [0-9a-f]
    if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
      throw new InternalServerErrorException(
        'ENCRYPTION_KEY inválida: configure 64 caracteres hexadecimais (32 bytes) no .env.',
      );
    }

    this.masterKey = Buffer.from(keyHex, 'hex');
  }

  // Tranca um valor em texto puro antes de grava-lo na tabela env_variables
  encrypt(plainText: string): EncryptedPayload {
    // Gera um IV aleatorio novo a cada operacao para que dois valores iguais gerem cifras diferentes
    const iv = randomBytes(this.ivLengthBytes);
    const cipher = createCipheriv(this.algorithm, this.masterKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf8'),
      cipher.final(),
    ]);

    // A authTag garante integridade: se alguem alterar 1 bit no banco, o decrypt falha
    const authTag = cipher.getAuthTag();

    return {
      encryptedValue: encrypted.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  // Destranca um valor EXCLUSIVAMENTE em memoria RAM no momento de enviar o .env via SFTP
  decrypt(payload: EncryptedPayload): string {
    const iv = Buffer.from(payload.iv, 'hex');
    const authTag = Buffer.from(payload.authTag, 'hex');
    const encryptedBuffer = Buffer.from(payload.encryptedValue, 'hex');

    const decipher = createDecipheriv(this.algorithm, this.masterKey, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encryptedBuffer),
      decipher.final(),
    ]);

    return decrypted.toString('utf8');
  }

  // Monta o conteudo do arquivo .env em memoria para envio via SFTP (--env-file no Docker)
  // Regra de seguranca: jamais logar o retorno desta funcao!
  formatEnvFile(entries: Array<{ key: string; value: string }>): string {
    return entries
      .map(({ key, value }) => {
        // Escapa quebras de linha para evitar quebrar o formato KEY=VALUE esperado pelo Docker --env-file
        const sanitizedValue = value.replace(/\r?\n/g, '\\n');
        return `${key}=${sanitizedValue}`;
      })
      .join('\n')
      .concat(entries.length > 0 ? '\n' : '');
  }
}
