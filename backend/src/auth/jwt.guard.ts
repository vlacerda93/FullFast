// Guard de autenticacao JWT: intercepta requisicoes antes de chegarem no Controller.
// Se o cabecalho "Authorization: Bearer <token>" estiver ausente, expirado ou adulterado,
// bloqueia o acesso com HTTP 401 (Unauthorized).

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import { Request } from 'express';

// Formato dos dados salvos dentro do payload do token JWT
export interface AuthenticatedUser {
  sub: string; // ID (UUID) do usuario no banco ("subject" do padrao JWT)
  email: string;
  role: UserRole; // Perfil carregado no token para o RBAC do Pos-MVP
}

// Estende o tipo Request do Express para o TypeScript reconhecer req.user
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Token de autenticação não informado.');
    }

    try {
      // Verifica assinatura criptografica e validade (expiracao) do JWT
      const payload = await this.jwtService.verifyAsync<AuthenticatedUser>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });

      // Anexa os dados do usuario autenticado na requisicao para o Controller e o RolesGuard usarem
      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido ou expirado.');
    }
  }

  // Extrai o token do cabecalho padrao HTTP: "Authorization: Bearer eyJhbGci..."
  private extractBearerToken(request: Request): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
