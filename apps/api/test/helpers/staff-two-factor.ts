import { PrismaService } from '../../src/modules/prisma/prisma.service';

/// 2FA персонала обязательна всегда (решение владельца Q22): при заданном
/// TWO_FACTOR_ENCRYPTION_KEY PermissionsGuard отклоняет действие по праву с 403
/// `admin_2fa_required`, если у пользователя в БД twoFactorEnabled=false
/// (JwtStrategy читает пользователя из БД на каждый запрос). Хелпер ставит ровно
/// это состояние тестовому сотруднику; секрет TOTP не нужен.
///
/// Вызывать ПОСЛЕ того, как пользователь получил токен: при twoFactorEnabled=true
/// `/auth/login` возвращает challenge вместо токенов.
export async function markStaffTwoFactorEnabled(
  prisma: PrismaService,
  userId: string,
): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { twoFactorEnabled: true },
  });
}
