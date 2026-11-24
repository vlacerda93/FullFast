// Ponto de entrada (bootstrap) da API Backend do FullFast.
// É o primeiro arquivo executado quando o servidor NestJS sobe.

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  // Cria a instancia principal da aplicacao carregando o modulo raiz (AppModule)
  const app = await NestFactory.create(AppModule);

  // Libera requisicoes vindas do Frontend (Next.js) rodando em outra porta/dominio (CORS)
  app.enableCors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  });

  // Pipe global de validacao: protege todas as rotas usando os DTOs (class-validator)
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Remove automaticamente campos extras nao declarados no DTO
      forbidNonWhitelisted: true, // Rejeita a requisicao com erro 400 se vier campo desconhecido
      transform: true, // Converte tipos automaticamente (ex.: string "3000" para number 3000)
    }),
  );

  // Configura a documentacao interativa Swagger (OpenAPI) para o Front testar as rotas
  const swaggerConfig = new DocumentBuilder()
    .setTitle('FullFast API — Terabits')
    .setDescription(
      'API da Plataforma de Deploy e Automação de Infraestrutura (MVP + base preparada para Pós-MVP).',
    )
    .setVersion('0.1.0')
    .addBearerAuth() // Habilita o botao "Authorize" no Swagger para testar rotas protegidas com JWT
    .build();

  // Gera e expoe o painel do Swagger na rota GET /docs
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);

  // Sobe o servidor HTTP na porta configurada no .env (padrao: 3001)
  const port = Number(process.env.PORT || 3001);
  await app.listen(port);

  console.log(`FullFast API rodando em http://localhost:${port}`);
  console.log(`Swagger disponível em http://localhost:${port}/docs`);
}

bootstrap();
