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
import { CreateCustomPositionDto } from './dto/create-custom-position.dto';
import { UpdateCustomPositionDto } from './dto/update-custom-position.dto';

@Controller('admin/custom-positions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CustomPositionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('custom_positions.view')
  /// Со счётчиком обладателей (ADR-0140).
  async list() {
    const positions = await this.prisma.customPosition.findMany({
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { users: true } } },
    });
    return positions.map(({ _count, ...position }) => ({
      ...position,
      usersCount: _count.users,
    }));
  }

  @Post()
  @RequirePermissions('custom_positions.create')
  async create(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateCustomPositionDto,
  ) {
    try {
      return await this.prisma.customPosition.create({
        data: { ...dto, createdBy: actor.id },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Должность с таким slug уже есть');
      }
      throw error;
    }
  }

  @Patch(':id')
  @RequirePermissions('custom_positions.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateCustomPositionDto) {
    const customPosition = await this.prisma.customPosition.findUnique({
      where: { id },
    });
    if (!customPosition) {
      throw new NotFoundException('Кастомная должность не найдена');
    }
    return this.prisma.customPosition.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  @RequirePermissions('custom_positions.delete')
  async remove(@Param('id') id: string) {
    const customPosition = await this.prisma.customPosition.findUnique({
      where: { id },
    });
    if (!customPosition) {
      throw new NotFoundException('Кастомная должность не найдена');
    }
    await this.prisma.customPosition.delete({ where: { id } });
    return { success: true };
  }
}
