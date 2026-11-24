// DTO que define e valida os dados enviados na Tela 1 (Login) do Frontend.

import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'vinicius@terabits.com.br', description: 'E-mail cadastrado na plataforma' })
  @IsEmail({}, { message: 'Informe um e-mail válido.' })
  email: string;

  @ApiProperty({ example: 'SenhaForte123', description: 'Senha do usuário' })
  @IsString({ message: 'A senha deve ser um texto válido.' })
  @MinLength(6, { message: 'A senha deve ter no mínimo 6 caracteres.' })
  password: string;
}
