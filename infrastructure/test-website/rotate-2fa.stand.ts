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

// Маркеры в stdout (значений нет): ROTATE_RESULT=rolled_back - БД ГАРАНТИРОВАННО не изменена (ошибка до транзакции либо проверкой
// после сбоя подтверждено, что в БД прежний секрет); ROTATE_RESULT=committed - новые значения в БД. Нет маркера при коде != 0 -
// исход неизвестен (обрыв связи и т.п.), rotate-2fa.sh в этом случае сохраняет временный файл с новыми значениями.
async function apply(): Promise<void> {
  const username = process.env.ADMIN_USERNAME ?? '';
  const inFile = process.env.IN_FILE ?? '';
  const key = process.env.TWO_FACTOR_ENCRYPTION_KEY ?? '';
  const rolledBack = (): never => {
    console.log('ROTATE_RESULT=rolled_back');
    throw new Error('rotate-2fa: откат подтверждён');
  };
  let secret = '';
  let codes: string[] = [];
  let box: SecretBox | undefined;
  try {
    if (!/^[A-Za-z0-9_.-]{2,64}$/.test(username) || !inFile) throw new Error('rotate-2fa: нет ADMIN_USERNAME/IN_FILE');
    const parts = readFileSync(inFile, 'utf8').trim().split(/\s+/);
    if (parts[0] !== 'admin2fa:' || parts.length < 3) throw new Error('rotate-2fa: некорректный блок');
    secret = parts[1];
    codes = parts.slice(2);
    box = new SecretBox(key); // бросит ошибку, если ключ короче 32 символов
  } catch {
    rolledBack(); // до обращения к БД
  }
  const sealer = box as SecretBox;
  const prisma = new PrismaClient({ log: [] });
  try {
    let userId = '';
    try {
      const user = await prisma.user.findUnique({ where: { username }, select: { id: true } });
      if (!user) throw new Error('rotate-2fa: пользователь не найден');
      userId = user.id;
    } catch {
      rolledBack(); // запись ещё не начиналась
    }
    try {
      await prisma.$transaction([
        prisma.user.update({
          where: { id: userId },
          data: {
            twoFactorEnabled: true,
            twoFactorSecret: sealer.encrypt(secret),
            twoFactorPendingSecret: null,
            twoFactorEnabledAt: new Date(),
            twoFactorLastStep: null,
          },
        }),
        prisma.twoFactorBackupCode.deleteMany({ where: { userId } }),
        prisma.twoFactorBackupCode.createMany({
          data: codes.map((value) => ({ userId, codeHash: sealer.hash(normalizeBackupCode(value)!) })),
        }),
        // Инвалидация сессий админа: все refresh-токены отзываются (access JWT доживает свой короткий TTL).
        prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
    } catch {
      // Ошибка транзакции не доказывает откат (возможен обрыв после коммита): сверяем фактическое состояние.
      // Чтение сразу после сбоя может увидеть состояние до коммита: rolled_back только если ОБА чтения (с паузой ~3 с) показывают прежний секрет.
      const readIsNew = async (): Promise<boolean> => {
        const row = await prisma.user.findUnique({ where: { id: userId }, select: { twoFactorSecret: true } });
        return !!row?.twoFactorSecret && sealer.decrypt(row.twoFactorSecret) === secret;
      };
      let isNew: boolean;
      try {
        isNew = await readIsNew();
        if (!isNew) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
          isNew = await readIsNew();
        }
      } catch {
        throw new Error('rotate-2fa: исход неизвестен');
      }
      if (!isNew) rolledBack(); // в БД прежний секрет: транзакция откатилась
      // в БД уже новый секрет: коммит состоялся, ошибка пришла после него - это успех
    }
    console.log('ROTATE_RESULT=committed');
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

async function main(): Promise<void> {
  const mode = process.env.ROTATE_MODE;
  if (mode === 'generate') generate();
  else if (mode === 'apply') await apply();
  else throw new Error('rotate-2fa: неизвестный ROTATE_MODE');
  if (mode === 'generate') console.log('ok');
}
main().catch(() => {
  console.error('rotate-2fa: ошибка (детали скрыты; значения не печатаются)');
  process.exit(1);
});
