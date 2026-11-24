// Controller de autenticacao: expoe as rotas HTTP usadas pela Tela 1 (Login)
// e pela checagem de sessao no Frontend Next.js.

import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedRequest, JwtAuthGuard } from './jwt.guard';

@ApiTags('Auth') // Secao "Auth" no Swagger (/docs)
@Controller('auth') // Prefixo das rotas: /auth/...
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register') // POST /auth/register
  @ApiOperation({
    summary: 'Cadastra um novo usuário da equipe (o primeiro cadastro recebe perfil ADMIN)',
  })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login') // POST /auth/login
  @HttpCode(HttpStatus.OK) // Login bem-sucedido retorna 200 OK (em vez de 201 Created)
  @ApiOperation({ summary: 'Autentica com e-mail e senha e retorna o token JWT' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('me') // GET /auth/me (rota protegida: exige header Authorization: Bearer <token>)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth() // Mostra o cadeado no Swagger indicando que precisa de JWT
  @ApiOperation({ summary: 'Retorna os dados do usuário autenticado pelo token JWT' })
  getMe(@Req() req: AuthenticatedRequest) {
    return this.authService.getProfile(req.user.sub);
  }
}
