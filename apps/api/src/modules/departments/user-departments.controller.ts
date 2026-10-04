import {
  Body,
  Controller,
  Delete,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { ReorderDepartmentsDto } from './dto/reorder-departments.dto';

@Controller('admin/users/:userId/departments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('departments.assign')
export class UserDepartmentsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post(':departmentId')
  async add(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('userId') userId: string,
    @Param('departmentId') departmentId: string,
  ) {
    const [user, department] = await Promise.all([
      this.prisma.user.findUnique({ where: { id: userId } }),
      this.prisma.department.findUnique({ where: { id: departmentId } }),
    ]);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    if (!department) {
      throw new NotFoundException('Отдел не найден');
    }

    const maxOrder = await this.prisma.userDepartment.aggregate({
      where: { userId },
      _max: { order: true },
    });

    await this.prisma.userDepartment.upsert({
      where: { userId_departmentId: { userId, departmentId } },
      create: {
        userId,
        departmentId,
        assignedBy: actor.id,
        order: (maxOrder._max.order ?? -1) + 1,
      },
      update: {},
    });
    return { success: true };
  }

  @Delete(':departmentId')
  async remove(
    @Param('userId') userId: string,
    @Param('departmentId') departmentId: string,
  ) {
    await this.prisma.userDepartment.deleteMany({
      where: { userId, departmentId },
    });
    return { success: true };
  }

  @Patch('order')
  async reorder(
    @Param('userId') userId: string,
    @Body() dto: ReorderDepartmentsDto,
  ) {
    await this.prisma.$transaction(
      dto.departmentIds.map((departmentId, index) =>
        this.prisma.userDepartment.updateMany({
          where: { userId, departmentId },
          data: { order: index },
        }),
      ),
    );
    return { success: true };
  }
}
