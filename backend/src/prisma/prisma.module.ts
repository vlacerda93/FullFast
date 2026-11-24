// Modulo do Prisma marcado como @Global().
// Isso permite que qualquer outro modulo (Auth, Applications, Env, Deployments)
// injete o PrismaService direto no construtor, sem precisar importar PrismaModule toda vez.

import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
