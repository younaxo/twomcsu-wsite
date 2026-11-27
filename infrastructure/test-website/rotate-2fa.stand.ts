// Одноразовый скрипт ротации 2FA админа стенда. Запускается ТОЛЬКО из rotate-2fa.sh внутри контейнера twomc-stand-tools
// (монтируется как /app/apps/api/rotate-2fa.stand.ts). Шифрование/хеширование - код API без изменений (SecretBox, ADR-0109).
// Значения (секрет, коды) пишутся только в файл OUT_FILE (600); в stdout - «ok» и ничего больше.
import { PrismaClient } from '@prisma/client';
import { chmodSync, writeFileSync } from 'fs';
import { generateBackupCodes, normalizeBackupCode } from './src/modules/auth/two-factor/backup-codes';
import { SecretBox } from './src/modules/auth/two-factor/secret-box';
import { generateTotpSecret } from './src/modules/auth/two-factor/totp';

async function main(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? '';
  const outFile = process.env.OUT_FILE ?? '';
  const key = process.env.TWO_FACTOR_ENCRYPTION_KEY ?? '';
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username) || !outFile) throw new Error('rotate-2fa: нет ADMIN_USERNAME/OUT_FILE');
  const box = new SecretBox(key); // бросит ошибку, если ключ короче 32 символов
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new Error('rotate-2fa: пользователь не найден');
    const secret = generateTotpSecret();
    const codes = generateBackupCodes();
    // Сначала файл (чтобы при сбое записи БД не менялась), затем транзакция в БД.
    writeFileSync(outFile, `admin2fa: ${secret} ${codes.join(' ')}\n`, { mode: 0o600 });
    chmodSync(outFile, 0o600);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: {
          twoFactorEnabled: true,
          twoFactorSecret: box.encrypt(secret),
          twoFactorPendingSecret: null,
          twoFactorEnabledAt: new Date(),
          twoFactorLastStep: null,
        },
      }),
      prisma.twoFactorBackupCode.deleteMany({ where: { userId: user.id } }),
      prisma.twoFactorBackupCode.createMany({
        data: codes.map((value) => ({ userId: user.id, codeHash: box.hash(normalizeBackupCode(value)!) })),
      }),
      // Инвалидация сессий админа: все refresh-токены отзываются (access JWT доживает свой короткий TTL).
      prisma.refreshToken.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    console.log('ok');
  } finally {
    await prisma.$disconnect();
  }
}
main().catch(() => {
  console.error('rotate-2fa: ошибка (детали скрыты; значения не печатаются)');
  process.exit(1);
});
