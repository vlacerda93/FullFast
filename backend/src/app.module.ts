// Modulo raiz do NestJS: funciona como o "painel central" que conecta
// todos os modulos de negocio, configuracoes e controllers da API do MVP.

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { ApplicationsModule } from './applications/applications.module';
import { AuthModule } from './auth/auth.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { EnvModule } from './env/env.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    // Carrega o arquivo .env automaticamente e disponibiliza as variaveis
    // em toda a aplicacao via ConfigService (isGlobal: true evita reimportar em cada modulo)
    ConfigModule.forRoot({
      isGlobal: true,
    }),

    // Modulos completos do Backend MVP (Passos 1 a 5):
    PrismaModule,       // Conexao global com o PostgreSQL
    AuthModule,         // Login, cadastro, JWT (BCrypt) e base de RBAC (ADMIN/DEV)
    ApplicationsModule, // CRUD de projetos, slug seguro e alocacao de portas (4000-4020)
    EnvModule,          // Variaveis de ambiente mascaradas + SecretsService (AES-256-GCM)
    DeploymentsModule,  // GitHub Actions + polling + SSH/SFTP Docker + Rollback 1 clique + Logs
  ],
  // Controllers registrados diretamente na raiz (rota GET /health)
  controllers: [AppController],
})
export class AppModule { }
