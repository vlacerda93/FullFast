// Controller de operacoes de deploy (Telas 4, 5 e 6):
// - Disparo de novo deploy (POST /applications/:applicationId/deployments)
// - Historico de versoes (GET /applications/:applicationId/deployments)
// - Acompanhamento de status de um deploy (GET /applications/:applicationId/deployments/:deploymentId)
// - Rollback em 1 clique (POST /applications/:applicationId/deployments/:deploymentId/rollback)
// - Visualizador de logs do container (GET /applications/:applicationId/logs?tail=100)

import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt.guard';
import { DeploymentsService } from './deployments.service';

@ApiTags('Deploys, Rollback e Logs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications/:applicationId')
export class DeploymentsController {
  constructor(private readonly deploymentsService: DeploymentsService) {}

  @Post('deployments') // POST /applications/:applicationId/deployments
  @HttpCode(HttpStatus.ACCEPTED) // 202 Accepted: deploy disparado em segundo plano
  @ApiOperation({
    summary: 'Dispara um novo deploy completo (GitHub Actions -> GHCR -> SSH/Docker)',
  })
  triggerDeploy(
    @Param('applicationId') applicationId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.deploymentsService.triggerDeploy(applicationId, req.user.sub);
  }

  @Get('deployments') // GET /applications/:applicationId/deployments
  @ApiOperation({
    summary: 'Lista o histórico de deploys do projeto (do mais recente para o mais antigo)',
  })
  listHistory(@Param('applicationId') applicationId: string) {
    return this.deploymentsService.listHistory(applicationId);
  }

  @Get('deployments/:deploymentId') // GET /applications/:applicationId/deployments/:deploymentId
  @ApiOperation({
    summary: 'Consulta o status atual de um deploy específico (usado na linha de progresso)',
  })
  findOne(
    @Param('applicationId') applicationId: string,
    @Param('deploymentId') deploymentId: string,
  ) {
    return this.deploymentsService.findOne(applicationId, deploymentId);
  }

  @Post('deployments/:deploymentId/rollback') // POST /applications/:applicationId/deployments/:deploymentId/rollback
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Rollback em 1 clique: reaplica a tag GHCR de uma versão anterior via SSH sem rebuild',
  })
  rollback(
    @Param('applicationId') applicationId: string,
    @Param('deploymentId') deploymentId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.deploymentsService.rollback(
      applicationId,
      deploymentId,
      req.user.sub,
    );
  }

  @Get('logs') // GET /applications/:applicationId/logs?tail=100
  @ApiOperation({
    summary: 'Retorna as últimas linhas de log (stdout/stderr) do container na VPS via SSH',
  })
  @ApiQuery({
    name: 'tail',
    required: false,
    example: 100,
    description: 'Quantidade de linhas finais (100, 200 ou 500)',
  })
  getLogs(
    @Param('applicationId') applicationId: string,
    @Query('tail') tail?: string,
  ) {
    const parsedTail = tail ? Number(tail) : 100;
    return this.deploymentsService.getLogs(
      applicationId,
      Number.isNaN(parsedTail) ? 100 : parsedTail,
    );
  }
}
