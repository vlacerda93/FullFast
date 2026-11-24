// Modulo de variaveis de ambiente e segredos.
// Exporta EnvService e SecretsService para serem usados por ApplicationsModule e DeploymentsModule.

import { Module } from '@nestjs/common';
import { EnvController } from './env.controller';
import { EnvService } from './env.service';
import { SecretsService } from './secrets.service';

@Module({
  controllers: [EnvController],
  providers: [SecretsService, EnvService],
  exports: [SecretsService, EnvService],
})
export class EnvModule {}
