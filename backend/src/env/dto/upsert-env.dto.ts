// DTO para criar ou atualizar uma variavel de ambiente de um projeto.
// A regex na chave evita caracteres perigosos (espacos, ";", "$") que poderiam quebrar o arquivo .env.

import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength } from 'class-validator';

export class UpsertEnvDto {
  @ApiProperty({
    example: 'DATABASE_URL',
    description: 'Nome da variável (apenas letras maiúsculas, números e underscore)',
  })
  @IsString()
  @MaxLength(100)
  @Matches(/^[A-Z_][A-Z0-9_]*$/, {
    message:
      'A chave deve começar com letra maiúscula ou "_" e conter apenas A-Z, 0-9 e "_".',
  })
  envKey: string;

  @ApiProperty({
    example: 'postgresql://user:pass@host:5432/db',
    description: 'Valor da variável (será salvo criptografado com AES-256-GCM)',
  })
  @IsString({ message: 'O valor da variável deve ser uma string.' })
  value: string;
}
