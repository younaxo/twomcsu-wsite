import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { ListUsersDto } from './dto/list-users.dto';

const SAFE_USER_SELECT = {
  id: true,
  shortId: true,
  tag: true,
  email: true,
  username: true,
  accountType: true,
  isBanned: true,
  isVerified: true,
  lastLoginAt: true,
  createdAt: true,
  position: true,
} satisfies Prisma.UserSelect;

@Controller('admin/users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('users.view')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: ListUsersDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.UserWhereInput | undefined = query.q
      ? {
          OR: [
            { username: { contains: query.q, mode: 'insensitive' } },
            { email: { contains: query.q, mode: 'insensitive' } },
            { tag: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : undefined;

    const [items, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: SAFE_USER_SELECT,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  @Get(':id/full')
  async full(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        ...SAFE_USER_SELECT,
        departments: { include: { department: true } },
        customPosition: { include: { customPosition: true } },
        roles: { include: { role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return user;
  }
}
