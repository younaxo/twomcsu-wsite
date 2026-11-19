import { writeFileSync } from 'fs';
import {
  deriveServerKey,
  formatKeyId,
} from '../src/modules/giveaway/giveaway-crypto';
import {
  SERVER_ID_PATTERN,
  isStrongMasterSecret,
} from '../src/modules/giveaway/giveaway.constants';

/// Выдача ключа сервера розыгрыша - ТОЛЬКО для владельца. Мастер-секрет
/// берётся из окружения `GIVEAWAY_MASTER_SECRET`; ключ записывается в файл
/// (создаётся с правами только владельца, существующий файл не
/// перезаписывается). В stdout/stderr и логи печатается только key-id и путь.
///
///   GIVEAWAY_MASTER_SECRET=... npx ts-node scripts/giveaway-server-key.ts --server-id anarchy-new-era --version 1 --out ./giveaway-key.txt
export function issueKey(
  argv: string[],
  env: Record<string, string | undefined>,
): { keyId: string; out: string } {
  const read = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const serverId = read('--server-id');
  if (serverId === undefined || !SERVER_ID_PATTERN.test(serverId)) {
    throw new Error('--server-id: неверный формат');
  }
  const version = Number(read('--version') ?? '1');
  if (!Number.isInteger(version) || version < 1 || version > 999_999) {
    throw new Error('--version: целое от 1 до 999999');
  }
  const out = read('--out');
  if (out === undefined || out === '')
    throw new Error('--out: нужен путь файла');
  const secret = Buffer.from(env.GIVEAWAY_MASTER_SECRET ?? '', 'utf8');
  if (!isStrongMasterSecret(secret)) {
    throw new Error('GIVEAWAY_MASTER_SECRET не задан или слабый');
  }
  const key = deriveServerKey(secret, serverId, version);
  // flag 'wx': не перезаписывать; mode 0600 (на Windows действует частично).
  writeFileSync(out, `${key.toString('hex')}\n`, { flag: 'wx', mode: 0o600 });
  return { keyId: formatKeyId(serverId, version), out };
}

if (require.main === module) {
  try {
    const r = issueKey(process.argv.slice(2), process.env);
    process.stdout.write(`key-id: ${r.keyId}\nключ записан в файл: ${r.out}\n`);
  } catch (e) {
    process.stderr.write(`Ошибка: ${(e as Error).message}\n`);
    process.exit(1);
  }
}
