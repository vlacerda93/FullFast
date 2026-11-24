// Modulo de projetos: importa EnvModule (para salvar variaveis iniciais no cadastro)
// e InfraModule (para remover container/.env na VPS ao excluir um projeto).

import { Module } from '@nestjs/common';
import { EnvModule } from '../env/env.module';
import { InfraModule } from '../infra/infra.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [EnvModule, InfraModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService],
  exports: [ApplicationsService],
})
export class ApplicationsModule {}
