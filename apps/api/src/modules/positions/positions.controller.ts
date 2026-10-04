import {
  Body,
  ConflictException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AssignPositionDto } from './dto/assign-position.dto';
import { CreatePositionDto } from './dto/create-position.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PositionsController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('positions')
  async listPublic() {
    return this.prisma.position.findMany({
      where: { isVisible: true },
      orderBy: { priority: 'desc' },
    });
  }

  @Get('positions/manage')
  @RequirePermissions('positions.view')
  async listAll() {
    return this.prisma.position.findMany({ orderBy: { priority: 'desc' } });
  }

  @Post('positions')
  @RequirePermissions('positions.create')
  async create(@Body() dto: CreatePositionDto) {
    return this.prisma.position.create({ data: dto });
  }

  @Patch('positions/:id')
  @RequirePermissions('positions.edit')
  async update(@Param('id') id: string, @Body() dto: UpdatePositionDto) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) {
      throw new NotFoundException('Позиция не найдена');
    }
    return this.prisma.position.update({ where: { id }, data: dto });
  }

  @Delete('positions/:id')
  @RequirePermissions('positions.delete')
  async remove(@Param('id') id: string) {
    const position = await this.prisma.position.findUnique({ where: { id } });
    if (!position) {
      throw new NotFoundException('Позиция не найдена');
    }
    if (position.isDefault) {
      throw new ForbiddenException('Позицию по умолчанию нельзя удалить');
    }
    try {
      await this.prisma.position.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new ConflictException(
          'Позицию нельзя удалить — она назначена пользователям',
        );
      }
      throw error;
    }
    return { success: true };
  }

  @Post('positions/:id/assign')
  @RequirePermissions('positions.assign')
  async assign(@Param('id') id: string, @Body() dto: AssignPositionDto) {
    const [position, user] = await Promise.all([
      this.prisma.position.findUnique({ where: { id } }),
      this.prisma.user.findUnique({ where: { id: dto.userId } }),
    ]);
    if (!position) {
      throw new NotFoundException('Позиция не найдена');
    }
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    await this.prisma.user.update({
      where: { id: dto.userId },
      data: { positionId: id },
    });
    return { success: true };
  }
}
