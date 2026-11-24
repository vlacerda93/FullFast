// Servico central de conexao com o banco PostgreSQL usando o Prisma ORM.
// Toda comunicacao com o banco passa por esta classe para manter um unico pool de conexoes.

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  // Executado automaticamente quando o NestJS sobe a aplicacao: abre a conexao com o banco
  async onModuleInit() {
    await this.$connect();
  }

  // Executado quando o servidor e desligado (ex.: docker stop): fecha a conexao de forma limpa
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
