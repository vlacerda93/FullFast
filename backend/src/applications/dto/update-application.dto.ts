// DTO da Aba "Configuracoes" (Tela 4): permite editar campos de um projeto existente.
// Todos os campos sao opcionais para suportar atualizacao parcial (PATCH).

import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateApplicationDto {
  @ApiPropertyOptional({ example: 'FinUp API v2' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({ example: 'develop' })
  @IsOptional()
  @IsString()
  branch?: string;

  @ApiPropertyOptional({ example: 'deploy.yml' })
  @IsOptional()
  @IsString()
  workflowFile?: string;

  @ApiPropertyOptional({ example: 8080 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  internalPort?: number;

  // Ganchos Pos-MVP (Traefik / Webhook)
  @ApiPropertyOptional({ example: 'finup.terabits.localhost' })
  @IsOptional()
  @IsString()
  domain?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  autoDeploy?: boolean;
}
