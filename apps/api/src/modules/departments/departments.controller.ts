import {
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Controller('admin/departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('departments.view')
  /// Со счётчиком участников (ADR-0140): удаление отдела снимает его со
  /// всех участников, это видно в подтверждении.
  async list() {
    const departments = await this.prisma.department.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { members: true } } },
    });
    return departments.map(({ _count, ...department }) => ({
      ...department,
      membersCount: _count.members,
    }));
  }

  @Post()
  @RequirePermissions('departments.create')
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateDepartmentDto,
  ) {
    try {
      return await this.prisma.department.create({
        data: { ...dto, createdBy: actor.id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Отдел с таким slug уже есть');
      }
      throw error;
    }
  }

  @Patch(':id')
  @RequirePermissions('departments.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException('Отдел не найден');
    }
    return this.prisma.department.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermissions('departments.delete')
  async remove(@Param('id') id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
    });
    if (!department) {
      throw new NotFoundException('Отдел не найден');
    }
    await this.prisma.department.delete({ where: { id } });
    return { success: true };
  }
}
