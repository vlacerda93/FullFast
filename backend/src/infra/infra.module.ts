// Modulo de infraestrutura: conecta o token abstrato DEPLOY_PROVIDER
// a implementacao concreta SshDockerDeployProvider.

import { Module } from '@nestjs/common';
import { DEPLOY_PROVIDER } from './deploy-provider.interface';
import { SshDockerDeployProvider } from './ssh-docker.provider';

@Module({
  providers: [
    {
      provide: DEPLOY_PROVIDER,
      useClass: SshDockerDeployProvider,
    },
  ],
  exports: [DEPLOY_PROVIDER],
})
export class InfraModule {}
