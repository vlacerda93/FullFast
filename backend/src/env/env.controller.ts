// Controller da Aba "Variaveis de Ambiente" (Tela 4).
// Todas as rotas exigem autenticacao JWT e nunca retornam valores descriptografados.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { UpsertEnvDto } from './dto/upsert-env.dto';
import { EnvService } from './env.service';

@ApiTags('Variáveis de Ambiente')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard) // Protege todas as rotas deste controller com JWT
@Controller('applications/:applicationId/env')
export class EnvController {
  constructor(private readonly envService: EnvService) {}

  @Get() // GET /applications/:applicationId/env
  @ApiOperation({
    summary: 'Lista as chaves de variáveis de ambiente do projeto (valores mascarados)',
  })
  list(@Param('applicationId') applicationId: string) {
    return this.envService.listMasked(applicationId);
  }

  @Put() // PUT /applications/:applicationId/env
  @ApiOperation({
    summary: 'Cria ou atualiza uma variável de ambiente (criptografada com AES-256-GCM)',
  })
  upsert(
    @Param('applicationId') applicationId: string,
    @Body() dto: UpsertEnvDto,
  ) {
    return this.envService.upsert(applicationId, dto);
  }

  @Delete(':envKey') // DELETE /applications/:applicationId/env/:envKey
  @ApiOperation({ summary: 'Remove uma variável de ambiente do projeto' })
  remove(
    @Param('applicationId') applicationId: string,
    @Param('envKey') envKey: string,
  ) {
    return this.envService.remove(applicationId, envKey);
  }
}
