// DTO do formulario da Tela 3 (Cadastro de Novo Projeto para Deploy).
// Ja inclui os campos opcionais de gancho do Pos-MVP (domain e autoDeploy).

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { UpsertEnvDto } from '../../env/dto/upsert-env.dto';

export class CreateApplicationDto {
  @ApiProperty({
    example: 'FinUp API',
    description: 'Nome amigável do projeto (gera automaticamente um slug seguro para o container)',
  })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({
    example: 'terabits',
    description: 'Organização ou usuário dono do repositório no GitHub',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'repoOwner contém caracteres inválidos.' })
  repoOwner: string;

  @ApiProperty({
    example: 'finup-api',
    description: 'Nome do repositório no GitHub (deve conter Dockerfile e workflow)',
  })
  @IsString()
  @Matches(/^[a-zA-Z0-9_.-]+$/, { message: 'repoName contém caracteres inválidos.' })
  repoName: string;

  @ApiPropertyOptional({ example: 'main', default: 'main', description: 'Branch usada no build' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({
    example: 'deploy.yml',
    default: 'deploy.yml',
    description: 'Nome do arquivo em .github/workflows/ disparado pela API',
  })
  @IsOptional()
  @IsString()
  workflowFile?: string;

  @ApiProperty({
    example: 3000,
    description: 'Porta interna onde a aplicação escuta dentro do container Docker',
  })
  @IsInt({ message: 'A porta interna deve ser um número inteiro.' })
  @Min(1)
  @Max(65535)
  internalPort: number;

  // --- Variaveis iniciais opcionais (Tela 3 permite cadastrar junto com o projeto) ---
  @ApiPropertyOptional({
    type: [UpsertEnvDto],
    description: 'Lista opcional de variáveis de ambiente iniciais',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertEnvDto)
  envVariables?: UpsertEnvDto[];

  // --- Ganchos opcionais do Pos-MVP (Traefik e Deploy Automatico via Webhook) ---
  @ApiPropertyOptional({
    example: 'finup.terabits.localhost',
    description: 'Opcional (Pós-MVP): subdomínio para roteamento via Traefik',
  })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({
    example: false,
    default: false,
    description: 'Opcional (Pós-MVP): ativa deploy automático via webhook de git push',
  })
  @IsOptional()
  @IsBoolean()
  autoDeploy?: boolean;
}
