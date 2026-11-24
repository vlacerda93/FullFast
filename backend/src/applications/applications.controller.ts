// Controller de projetos (Tela 2 — Listagem, Tela 3 — Cadastro e Tela 4 — Configuracoes).
// Todas as rotas sao protegidas com JWT; a exclusao pode receber @Roles(UserRole.ADMIN) no Pos-MVP.

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('Projetos (Applications)')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applicationsService: ApplicationsService) {}

  @Post() // POST /applications
  @ApiOperation({
    summary: 'Cadastra um novo projeto, aloca porta externa (4000-4020) e salva variáveis iniciais',
  })
  create(@Body() dto: CreateApplicationDto) {
    return this.applicationsService.create(dto);
  }

  @Get() // GET /applications?search=...&status=...
  @ApiOperation({ summary: 'Lista todos os projetos cadastrados com status do último deploy' })
  @ApiQuery({ name: 'search', required: false, description: 'Busca por nome, slug ou repositório' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filtra por status (ALL, NOT_DEPLOYED, QUEUED, BUILDING, DEPLOYING, ONLINE, FAILED)',
  })
  findAll(
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.applicationsService.findAll(search, status);
  }

  @Get(':id') // GET /applications/:id
  @ApiOperation({ summary: 'Retorna detalhes de um projeto específico' })
  findOne(@Param('id') id: string) {
    return this.applicationsService.findOne(id);
  }

  @Patch(':id') // PATCH /applications/:id
  @ApiOperation({ summary: 'Atualiza configurações do projeto (branch, porta interna, domínio)' })
  update(@Param('id') id: string, @Body() dto: UpdateApplicationDto) {
    return this.applicationsService.update(id, dto);
  }

  @Delete(':id') // DELETE /applications/:id
  @ApiOperation({
    summary: 'Exclui o projeto do banco e remove o container e o .env correspondentes na VPS',
  })
  remove(@Param('id') id: string) {
    return this.applicationsService.remove(id);
  }
}
