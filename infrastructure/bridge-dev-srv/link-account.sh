#!/usr/bin/env bash
# Привязка Minecraft-ника к АДМИНУ стенда (MinecraftAccount с офлайн-UUID ника), чтобы Bridge принимал снимки игрока.
# Запускается НА VDS: run-on-vds.sh script link-account.sh <ник> [--dry-run|--yes]. Без флага - только план (БД не трогается).
#   <ник>  3-16 символов [A-Za-z0-9_]; UUID = offline-uuid.sh (UUID v3 от "OfflinePlayer:<ник>", как на сервере с online-mode=false)
# Логин админа: файл /home/twomc/test-website-credentials.txt, секция [админ], строка `login:` (запасной вариант: вторая колонка строки `admin:`).
#   Поиск пользователя СТРОГО по username (email не используется; логин-email в файле - отказ). Пользователь обязан быть админом стенда
#   (роль с isSuperuser=true), иначе отказ (код 7). NODE_ENV стенда обязан быть development, иначе отказ (код 8): только стенд, не production.
# Логин и пароль НЕ печатаются; печатаются только ник и uuid.
# Поведение (идемпотентно):
#   у админа нет MinecraftAccount и uuid свободен       -> создаётся
#   у админа уже есть этот же ник и uuid                -> «уже привязан», без изменений
#   у админа уже есть ДРУГОЙ MinecraftAccount           -> сообщение, БЕЗ изменений (код 6)
#   uuid занят ДРУГИМ пользователем                     -> отказ (код 4)
# Запись в БД стенда - в tools-образе (код TS ниже, пишется во временный каталог 700 и монтируется ro); production не затрагивается.
# Коды: 0 готово/уже есть, 1 ошибка, 2 аргументы, 3 админ не найден, 4 uuid занят, 5 lock занят, 6 у админа другой аккаунт, 7 пользователь не админ, 8 NODE_ENV не development.
set -uo pipefail
if ! declare -F stand_init >/dev/null 2>&1; then source "$(dirname "${BASH_SOURCE[0]}")/stand-lib.sh"; fi
if ! declare -F offline_uuid >/dev/null 2>&1; then
# UUID v3 от "OfflinePlayer:<ник>" (то же, что offline-uuid.sh; продублировано, чтобы скрипт работал в пакете bash -s)
offline_uuid() {
  local h b6 b8
  h="$(printf 'OfflinePlayer:%s' "$1" | openssl md5 -binary | od -An -tx1 | tr -d ' \n')"
  b6=$(( (0x${h:12:2} & 0x0f) | 0x30 )); b8=$(( (0x${h:16:2} & 0x3f) | 0x80 ))
  printf '%s-%s-%02x%s-%02x%s-%s\n' "${h:0:8}" "${h:8:4}" "$b6" "${h:14:2}" "$b8" "${h:18:2}" "${h:20:12}"
}
fi
trap stand_cleanup EXIT

NICK=""; MODE=plan
for a in "$@"; do
  case "$a" in
    --dry-run) MODE=plan ;;
    --yes) MODE=yes ;;
    -*) echo "Неизвестный аргумент: $a (допустимо --dry-run | --yes)" >&2; exit 2 ;;
    *) [[ -z "$NICK" ]] || { echo "Ник задаётся один раз" >&2; exit 2; }; NICK="$a" ;;
  esac
done
[[ "$NICK" =~ ^[A-Za-z0-9_]{3,16}$ ]] || { echo "Использование: link-account.sh <ник 3-16 [A-Za-z0-9_]> [--dry-run|--yes]" >&2; exit 2; }
UUID="$(offline_uuid "$NICK")"
[[ "$UUID" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || { echo "не удалось вычислить offline-uuid" >&2; exit 1; }

stand_init || exit 1
if [[ "$(stand_env_get NODE_ENV)" != development ]]; then
  echo "ОТКАЗ: NODE_ENV стенда не development (значение не печатается); привязка только на стенде в режиме development."; exit 8
fi
[[ -r "$STAND_CRED_FILE" ]] || { echo "Нет файла учёток $STAND_CRED_FILE" >&2; exit 1; }
# логин админа: секция [админ], строка login: (регистр секции и ключа не важен); без вывода
ADMIN_LOGIN="$(awk '
  { sub(/\r$/, "") }
  /^[[:space:]]*\[.*\][[:space:]]*$/ { s=tolower($0); gsub(/^[[:space:]]*\[|\][[:space:]]*$/, "", s); sec=s; next }
  sec=="админ" && tolower($1)=="login:" { $1=""; sub(/^[[:space:]]+/, ""); print; exit }
' "$STAND_CRED_FILE")"
[[ -n "$ADMIN_LOGIN" ]] || ADMIN_LOGIN="$(awk '$1=="admin:"{print $2; exit}' "$STAND_CRED_FILE")"
[[ "$ADMIN_LOGIN" =~ ^[A-Za-z0-9_]{2,16}$ ]] || { echo "В файле учёток не найден username админа ([админ], строка login:; email не допускается: поиск только по username)" >&2; exit 1; }
echo "ник: $NICK"
echo "uuid: $UUID"

if [[ "$MODE" != yes ]]; then
  echo "ПЛАН: привязать ник к админу стенда (логин не печатается). БД не тронута. Для выполнения добавьте --yes."; exit 0
fi

stand_lock || exit $?
stand_write_db_env

TS="$STAND_WORK/link-account.stand.ts"
cat > "$TS" <<'LINK_TS_EOF'
// Одноразовый скрипт привязки MinecraftAccount админу стенда. Запускается ТОЛЬКО из link-account.sh в контейнере twomc-stand-tools.
// Значения (логин, ник, uuid) идут через env; в stdout - только маркер результата.
import { PrismaClient } from '@prisma/client';

async function main(): Promise<number> {
  const login = process.env.LINK_ADMIN_LOGIN ?? '';
  const name = process.env.LINK_NAME ?? '';
  const uuid = process.env.LINK_UUID ?? '';
  if (process.env.NODE_ENV !== 'development') {
    console.log('LINK_RESULT=not_dev');
    return 8;
  }
  if (!/^[A-Za-z0-9_]{2,16}$/.test(login) || !/^[A-Za-z0-9_]{3,16}$/.test(name) || !/^[0-9a-f-]{36}$/.test(uuid)) {
    console.log('LINK_RESULT=bad_input');
    return 1;
  }
  const prisma = new PrismaClient({ log: [] });
  try {
    const user = await prisma.user.findUnique({
      where: { username: login }, // строго username (unique); email не используется
      select: { id: true, roles: { select: { role: { select: { isSuperuser: true } } } } },
    });
    if (!user) {
      console.log('LINK_RESULT=no_admin');
      return 3;
    }
    // админ стенда = роль с isSuperuser (единственный источник wildcard-доступа, ADR-0004); иначе привязку не делаем
    if (!user.roles.some((r) => r.role.isSuperuser)) {
      console.log('LINK_RESULT=not_admin');
      return 7;
    }
    const own = await prisma.minecraftAccount.findUnique({ where: { userId: user.id } });
    if (own) {
      if (own.uuid === uuid && own.name === name) {
        console.log('LINK_RESULT=already');
        return 0;
      }
      console.log('LINK_RESULT=admin_has_other');
      return 6;
    }
    const taken = await prisma.minecraftAccount.findUnique({ where: { uuid } });
    if (taken) {
      console.log('LINK_RESULT=uuid_taken');
      return 4;
    }
    try {
      await prisma.minecraftAccount.create({ data: { userId: user.id, uuid, name } });
    } catch {
      // гонка: между проверкой и записью кто-то успел (unique по uuid или userId)
      console.log('LINK_RESULT=uuid_taken');
      return 4;
    }
    console.log('LINK_RESULT=created');
    return 0;
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}
main().then((c) => process.exit(c), () => {
  console.error('link-account: ошибка (детали скрыты)');
  process.exit(1);
});
LINK_TS_EOF
chmod 644 "$TS"   # контейнер работает под тем же uid, но файл не секретен

OUT="$STAND_WORK/link.out"
stand_tools "$TS" "LINK_ADMIN_LOGIN=$ADMIN_LOGIN" "LINK_NAME=$NICK" "LINK_UUID=$UUID" -- link-account.stand.ts > "$OUT" 2>/dev/null
rc=$?
ADMIN_LOGIN=""
res="$(sed -n 's/^LINK_RESULT=\([a-z_]*\)$/\1/p' "$OUT" | head -n1)"
case "$res" in
  created)        echo "привязано: админ стенда -> $NICK ($UUID)"; exit 0 ;;
  already)        echo "уже привязан: $NICK ($UUID), без изменений"; exit 0 ;;
  admin_has_other) echo "у админа уже есть другой MinecraftAccount, НЕ менялось (привязку меняйте осознанно вручную)"; exit 6 ;;
  uuid_taken)     echo "ОТКАЗ: uuid $UUID уже занят другим пользователем"; exit 4 ;;
  no_admin)       echo "ОТКАЗ: пользователь с username из файла учёток не найден в БД стенда"; exit 3 ;;
  not_admin)      echo "ОТКАЗ: пользователь не админ стенда (нет роли с isSuperuser), привязка не выполнена"; exit 7 ;;
  not_dev)        echo "ОТКАЗ: NODE_ENV в контейнере не development"; exit 8 ;;
  *)              echo "ОШИБКА (код $rc, результат: ${res:-нет}); текст ошибки не печатается"; exit 1 ;;
esac
