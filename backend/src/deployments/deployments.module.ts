// Modulo de deploys: reune ApplicationsModule, EnvModule, GithubModule e InfraModule
// para orquestrar todo o fluxo ponta a ponta (Passos 1 a 8 + Rollback + Logs).

import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { EnvModule } from '../env/env.module';
import { GithubModule } from '../github/github.module';
import { InfraModule } from '../infra/infra.module';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';

@Module({
  imports: [ApplicationsModule, EnvModule, GithubModule, InfraModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
})
export class DeploymentsModule {}
