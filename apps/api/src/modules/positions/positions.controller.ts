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

  /// Для админки — со счётчиками (ADR-0140): удалить можно только
  /// должность без пользователей и без товаров магазина, это видно заранее.
  @Get('positions/manage')
  @RequirePermissions('positions.view')
  async listAll() {
    const positions = await this.prisma.position.findMany({
      orderBy: { priority: 'desc' },
      include: { _count: { select: { users: true, products: true } } },
    });
    return positions.map(({ _count, ...position }) => ({
      ...position,
      usersCount: _count.users,
      productsCount: _count.products,
    }));
  }

  @Post('positions')
  @RequirePermissions('positions.create')
  async create(@Body() dto: CreatePositionDto) {
    try {
      return await this.prisma.position.create({ data: dto });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'Должность с таким названием или slug уже есть',
        );
      }
      throw error;
    }
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
    const [users, products] = await Promise.all([
      this.prisma.user.count({ where: { positionId: id } }),
      this.prisma.product.count({ where: { positionId: id } }),
    ]);
    if (users > 0) {
      throw new ConflictException(
        `Позицию нельзя удалить — она назначена пользователям (${users})`,
      );
    }
    if (products > 0) {
      throw new ConflictException(
        'Позицию нельзя удалить — её выдают товары магазина',
      );
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
