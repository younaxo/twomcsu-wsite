import { BadRequestException } from '@nestjs/common';
import { AccountType, Prisma } from '@prisma/client';
import { SystemMessageAudienceDto } from './dto/system-message.dto';

/// Только обычные активные аккаунты: не SYSTEM и не забаненные.
export const ACTIVE_USER: Prisma.UserWhereInput = {
  accountType: AccountType.DEFAULT,
  isBanned: false,
};

/// Условие выборки получателей массовой рассылки (общее для синхронного пути
/// и фонового воркера).
export function audienceWhere(
  audience: SystemMessageAudienceDto,
): Prisma.UserWhereInput {
  switch (audience.kind) {
    case 'all':
      return ACTIVE_USER;
    case 'role':
      if (!audience.roleId) throw new BadRequestException('Выберите роль');
      return { ...ACTIVE_USER, roles: { some: { roleId: audience.roleId } } };
    case 'users':
      if (!audience.userIds?.length) {
        throw new BadRequestException('Выберите получателей');
      }
      return { ...ACTIVE_USER, id: { in: audience.userIds } };
  }
}
