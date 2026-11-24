// Guard de autorizacao por perfil (RBAC — encaixe do Pos-MVP ja funcional).
// Deve ser usado sempre DEPOIS do JwtAuthGuard, pois le o perfil em req.user.role.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { AuthenticatedRequest } from './jwt.guard';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Le os perfis exigidos pelo decorator @Roles(...) na rota ou no controller
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Se a rota nao tiver @Roles(...), qualquer usuario autenticado pode acessar
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userRole = request.user?.role;

    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        'Você não tem permissão para executar esta ação.',
      );
    }

    return true;
  }
}
