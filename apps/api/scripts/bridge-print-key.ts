import {
  deriveServerKey,
  formatKeyId,
} from '../src/modules/bridge/bridge-crypto';
import {
  isValidSlug,
  MIN_MASTER_SECRET_BYTES,
  MIN_MASTER_SECRET_DISTINCT_BYTES,
  isStrongMasterSecret,
} from '../src/modules/bridge/bridge.constants';

/// Вывод ключа сервера (F3, 2.4 контракта) - ТОЛЬКО для владельца. Мастер-секрет
/// берётся из окружения `BRIDGE_MASTER_SECRET`; ключ печатается в stdout лишь
/// при явном флаге `--print-key`, без флага - отказ. Ключ и секрет не пишутся
/// в логи и stderr.
///
///   BRIDGE_MASTER_SECRET=... pnpm --filter @twomc/api run bridge:print-key -- --slug survival --generation 1 --print-key
export function printKey(
  argv: string[],
  env: Record<string, string | undefined>,
): { keyId: string; keyHex: string } {
  if (!argv.includes('--print-key')) {
    throw new Error('Отказ: ключ печатается только с явным флагом --print-key');
  }
  const read = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const slug = read('--slug');
  if (!isValidSlug(slug)) throw new Error('--slug: неверный формат');
  const gen = Number(read('--generation') ?? '1');
  if (!Number.isInteger(gen) || gen < 1 || gen > 999_999) {
    throw new Error('--generation: целое от 1 до 999999');
  }
  const secret = env.BRIDGE_MASTER_SECRET ?? '';
  if (!isStrongMasterSecret(Buffer.from(secret, 'utf8'))) {
    throw new Error(
      `BRIDGE_MASTER_SECRET не задан или слабый (нужно не менее ${MIN_MASTER_SECRET_BYTES} байт и ${MIN_MASTER_SECRET_DISTINCT_BYTES} различных байт)`,
    );
  }
  const key = deriveServerKey(Buffer.from(secret, 'utf8'), slug, gen);
  return { keyId: formatKeyId(slug, gen), keyHex: key.toString('hex') };
}

if (require.main === module) {
  try {
    const { keyId, keyHex } = printKey(process.argv.slice(2), process.env);
    process.stderr.write(
      'ВНИМАНИЕ: ключ секретный, не копируйте его в чаты, репозиторий и логи.\n',
    );
    process.stdout.write(`key-id: ${keyId}\nkey-hex: ${keyHex}\n`);
  } catch (e) {
    console.error((e as Error).message);
    process.exit(1);
  }
}
