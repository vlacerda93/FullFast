// DTO (Data Transfer Object) que define e valida os dados aceitos no cadastro de usuario.
// O ValidationPipe global (configurado no main.ts) usa estes decorators automaticamente.

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Vinicius Lacerda', description: 'Nome completo do membro da equipe' })
  @IsString({ message: 'O nome deve ser um texto válido.' })
  @MinLength(2, { message: 'O nome deve ter pelo menos 2 caracteres.' })
  name: string;

  @ApiProperty({ example: 'vinicius@terabits.com.br', description: 'E-mail corporativo único' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @ApiProperty({ example: 'SenhaForte123', minLength: 6, description: 'Senha de acesso (mínimo 6 caracteres)' })
  @IsString({ message: 'A senha deve ser um texto válido.' })
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres.' })
  password: string;

  // Seguranca: o campo "role" NAO e aceito aqui para impedir que alguem se cadastre
  // enviando { "role": "ADMIN" } por conta propria (escalacao de privilegio).
}
