// Servico com toda a regra de negocio de autenticacao:
// cadastro com hash BCrypt, validacao de login, geracao de JWT e consulta de perfil.

import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AuthenticatedUser } from './jwt.guard';

@Injectable()
export class AuthService {
  // Custo do BCrypt (10 rodadas): equilibrio padrao de mercado entre seguranca e performance
  private readonly bcryptSaltRounds = 10;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  // Cadastra um novo membro da equipe e ja devolve o token JWT para entrar direto no painel
  async register(dto: RegisterDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Evita duplicidade de e-mail antes de tentar gravar no banco
    const existingUser = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Já existe um usuário cadastrado com este e-mail.');
    }

    // Bootstrap inteligente pro MVP: o primeiro usuario cadastrado vira ADMIN automaticamente;
    // os demais entram como DEV por padrao (pronto para RBAC no Pos-MVP).
    const totalUsers = await this.prisma.user.count();
    const role = totalUsers === 0 ? UserRole.ADMIN : UserRole.DEV;

    // Transforma a senha em hash irreversivel (BCrypt) — jamais salvamos senha em texto puro
    const passwordHash = await bcrypt.hash(dto.password, this.bcryptSaltRounds);

    const user = await this.prisma.user.create({
      data: {
        name: dto.name.trim(),
        email: normalizedEmail,
        passwordHash,
        role,
      },
      // select explicito garante que passwordHash NUNCA vaze na resposta da API
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    const accessToken = await this.signToken(user.id, user.email, user.role);

    return {
      user,
      accessToken,
    };
  }

  // Autentica o usuario (Tela 1 — Login) comparando a senha informada com o hash salvo
  async login(dto: LoginDto) {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    // Seguranca: retornamos a MESMA mensagem generica para e-mail inexistente ou senha errada,
    // evitando que atacantes descubram quais e-mails existem cadastrados no sistema.
    if (!user) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const passwordMatches = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const accessToken = await this.signToken(user.id, user.email, user.role);

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
      accessToken,
    };
  }

  // Retorna os dados do usuario logado (usado pelo Frontend para validar sessao ao recarregar a pagina)
  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Usuário não encontrado.');
    }

    return user;
  }

  // Gera o token JWT assinado contendo ID, e-mail e role (usado pelo JwtAuthGuard e RolesGuard)
  private async signToken(
    userId: string,
    email: string,
    role: UserRole,
  ): Promise<string> {
    const payload: AuthenticatedUser = {
      sub: userId,
      email,
      role,
    };

    return this.jwtService.signAsync(payload);
  }
}
