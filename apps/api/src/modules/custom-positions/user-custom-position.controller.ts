import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AssignCustomPositionDto } from './dto/assign-custom-position.dto';

@Controller('admin/users/:userId/custom-position')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('custom_positions.assign')
export class UserCustomPositionController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async assign(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId') userId: string,
    @Body() dto: AssignCustomPositionDto,
  ) {
    const [user, customPosition] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.customPosition.findUnique({
        where: { id: dto.customPositionId },
      }),
    ]);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (!customPosition) {
      throw new NotFoundException('Кастомная должность не найдена');
    }

    await this.prisma.userCustomPosition.upsert({
      where: { userId },
      create: {
        userId,
        customPositionId: dto.customPositionId,
        assignedBy: actor.id,
      },
      update: { customPositionId: dto.customPositionId, assignedBy: actor.id },
    });
    return { success: true };
  }

  @Delete()
  async remove(@Param('userId') userId: string) {
    await this.prisma.userCustomPosition.deleteMany({ where: { userId } });
    return { success: true };
  }
}
