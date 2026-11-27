// Одноразовый скрипт ротации 2FA админа стенда. Запускается ТОЛЬКО из rotate-2fa.sh внутри контейнера twomc-stand-tools
// (монтируется как /app/apps/api/rotate-2fa.stand.ts). Шифрование/хеширование - код API без изменений (SecretBox, ADR-0109).
// Два режима (ROTATE_MODE), значения идут только через файлы (600), не через argv/stdout:
//   generate: генерирует секрет и коды, пишет блок `admin2fa: <секрет> <коды...>` в OUT_FILE; БД не трогает.
//   apply:    читает блок из IN_FILE и одной транзакцией применяет к БД.
// Порядок «файл учёток раньше БД» обеспечивает rotate-2fa.sh (generate -> временный файл рядом с учётками -> apply -> rename).
import { PrismaClient } from '@prisma/client';
import { chmodSync, readFileSync, writeFileSync } from 'fs';
import { generateBackupCodes, normalizeBackupCode } from './src/modules/auth/two-factor/backup-codes';
import { SecretBox } from './src/modules/auth/two-factor/secret-box';
import { generateTotpSecret } from './src/modules/auth/two-factor/totp';

function generate(): void {
  const outFile = process.env.OUT_FILE ?? '';
  if (!outFile) throw new Error('rotate-2fa: нет OUT_FILE');
  const secret = generateTotpSecret();
  const codes = generateBackupCodes();
  writeFileSync(outFile, `admin2fa: ${secret} ${codes.join(' ')}\n`, { mode: 0o600 });
  chmodSync(outFile, 0o600);
}

async function apply(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? '';
  const inFile = process.env.IN_FILE ?? '';
  const key = process.env.TWO_FACTOR_ENCRYPTION_KEY ?? '';
  if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username) || !inFile) throw new Error('rotate-2fa: нет ADMIN_USERNAME/IN_FILE');
  const parts = readFileSync(inFile, 'utf8').trim().split(/\s+/);
  if (parts[0] !== 'admin2fa:' || parts.length < 3) throw new Error('rotate-2fa: некорректный блок');
  const secret = parts[1];
  const codes = parts.slice(2);
  const box = new SecretBox(key); // бросит ошибку, если ключ короче 32 символов
  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!user) throw new Error('rotate-2fa: пользователь не найден');
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
  } finally {
    await prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  const mode = process.env.ROTATE_MODE;
  if (mode === 'generate') generate();
  else if (mode === 'apply') await apply();
  else throw new Error('rotate-2fa: неизвестный ROTATE_MODE');
  console.log('ok');
}
main().catch(() => {
  console.error('rotate-2fa: ошибка (детали скрыты; значения не печатаются)');
  process.exit(1);
});
