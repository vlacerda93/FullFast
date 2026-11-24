// Modulo de autenticacao: configura o JwtModule usando variaveis do .env
// e exporta os Guards para que outros modulos possam proteger suas rotas.

import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt.guard';
import { RolesGuard } from './roles.guard';

@Module({
  imports: [
    // registerAsync permite ler JWT_SECRET e JWT_EXPIRES_IN depois que o ConfigModule carregar o .env
    JwtModule.registerAsync({
      global: true, // Torna o JwtService disponivel em toda a aplicacao para o JwtAuthGuard
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '8h'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
