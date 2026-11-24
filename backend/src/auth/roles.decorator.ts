// Decorator personalizado para marcar quais perfis (ADMIN, DEV) podem acessar uma rota.
// Exemplo de uso no Pos-MVP (RBAC):
//   @Roles(UserRole.ADMIN)
//   @UseGuards(JwtAuthGuard, RolesGuard)
//   @Delete(':id')

import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';

export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);
