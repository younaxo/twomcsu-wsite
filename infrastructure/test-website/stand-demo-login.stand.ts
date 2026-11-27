// Одноразовый скрипт: задать пароль демо-игроку стенда (demo_*), чтобы владелец мог войти и увидеть «Мои наказания».
// Запускается ТОЛЬКО из stand-demo-login.sh внутри контейнера twomc-stand-tools (монтируется как /app/apps/api/stand-demo-login.stand.ts).
// Хеш - ровно как в AuthService (bcrypt, BCRYPT_ROUNDS, по умолчанию 12; поле User.password). Пароль приходит ТОЛЬКО через файл IN_FILE (600),
// не через argv/stdout. Меняется одна запись: password и mustChangePassword=false у пользователя с точным именем DEMO_USERNAME.
// Другие пользователи, роли, 2FA, бан и сессии не затрагиваются. Вход возможен, пока пользователь не забанен и не SYSTEM;
// emailVerified для входа не требуется (auth.service.ts login: нужны не-SYSTEM, не isBanned, верный bcrypt; twoFactorEnabled у demo не включён).
// Забаненный пользователь не меняется (маркер not_found): вход всё равно был бы невозможен, снимать бан скрипт не вправе.
// stdout: только маркер DEMO_LOGIN_RESULT=ok | refused | not_found (значений нет).
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { readFileSync } from 'fs';

const NAME_RE = /^demo_[a-z0-9_]{1,40}$/;

/// Чистая проверка входных данных (экспортируется для проверки transpile и ручных прогонов).
export function validateInput(env: NodeJS.ProcessEnv, password: string): string | null {
  if (env.NODE_ENV !== 'development') return 'NODE_ENV != development';
  if (!NAME_RE.test(env.DEMO_USERNAME ?? '')) return 'не demo_*';
  if (password.length < 16 || password.length > 72 || /\s/.test(password)) return 'пароль не подходит';
  return null;
}

async function main(): Promise<void> {
  const inFile = process.env.IN_FILE ?? '';
  const password = inFile ? readFileSync(inFile, 'utf8').replace(/\r?\n$/, '') : '';
  if (validateInput(process.env, password) !== null) {
    console.log('DEMO_LOGIN_RESULT=refused');
    process.exit(1);
  }
  const username = process.env.DEMO_USERNAME as string;
  const rounds = Number(process.env.BCRYPT_ROUNDS ?? '12');
  if (!Number.isInteger(rounds) || rounds < 4 || rounds > 15) {
    console.log('DEMO_LOGIN_RESULT=refused');
    process.exit(1);
  }
  const prisma = new PrismaClient({ log: [] });
  try {
    const user = await prisma.user.findUnique({ where: { username }, select: { id: true, accountType: true, isBanned: true } });
    if (!user || user.accountType === 'SYSTEM' || user.isBanned) {
      console.log('DEMO_LOGIN_RESULT=not_found');
      process.exit(1);
    }
    const hash = await bcrypt.hash(password, rounds);
    await prisma.user.update({ where: { id: user.id }, data: { password: hash, mustChangePassword: false } });
    console.log('DEMO_LOGIN_RESULT=ok');
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
main().catch(() => {
  console.error('stand-demo-login: ошибка (детали скрыты; значения не печатаются)');
  process.exit(1);
});
