// Controller raiz da API: expoe a rota de verificacao de saude (/health).
// Em DevOps, essa rota e usada por Docker healthchecks, monitoramento e testes rapidos
// para confirmar que o processo da API subiu e esta respondendo HTTP 200.

import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Health') // Agrupa esta rota na secao "Health" dentro do Swagger (/docs)
@Controller() // Prefixo vazio: responde diretamente na raiz da API
export class AppController {
  @Get('health') // Mapeia requisicoes GET /health
  @ApiOperation({ summary: 'Verifica se a API do FullFast está online' })
  getHealth() {
    return {
      status: 'ok',
      service: 'fullfast-api',
      timestamp: new Date().toISOString(), // Ajuda a confirmar que a resposta e ao vivo (sem cache)
    };
  }
}
