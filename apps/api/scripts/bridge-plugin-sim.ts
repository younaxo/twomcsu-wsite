import { randomBytes, randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import { isProductionLike } from '../src/config/node-env';
import {
  deriveServerKey,
  formatKeyId,
  signRequest,
} from '../src/modules/bridge/bridge-crypto';
import {
  BRIDGE_PROTOCOL,
  BRIDGE_SCHEMA,
  HEADER_KEY_ID,
  HEADER_NONCE,
  HEADER_PROTOCOL,
  HEADER_SIGNATURE,
  HEADER_TIMESTAMP,
  MAX_EVENTS_PER_BATCH,
  PATH_EVENTS,
  isValidSlug,
} from '../src/modules/bridge/bridge.constants';

/// Симулятор плагина Bridge (раздел 8 контракта) - ТЕСТОВЫЙ инструмент.
/// Работает только при NODE_ENV in {development, test}; пустой/незаданный
/// NODE_ENV = отказ. Подпись - общая функция `signRequest` модуля bridge
/// (без копии логики). Секрет (`BRIDGE_MASTER_SECRET`) и адрес (`API_URL`)
/// берутся из окружения, значения в вывод не печатаются.
///
///   ts-node scripts/bridge-plugin-sim.ts scenario test/fixtures/bridge/hello.json --server survival [--mode bad-signature]

export const FAILURE_MODES = [
  'bad-signature',
  'stale-time',
  'future-time',
  'replay-nonce',
  'replay-batch',
  'reverse-order',
  'seq-gap',
  'batch-101',
  'oversize',
  'foreign-server',
  'future-type',
] as const;
export type FailureMode = (typeof FAILURE_MODES)[number];

export interface ScenarioStep {
  type: string;
  data: Record<string, unknown>;
}
export interface Scenario {
  name: string;
  streamId: string;
  steps: ScenarioStep[];
  modes?: string[];
}

export interface SimRequest {
  method: 'POST';
  path: string;
  headers: Record<string, string>;
  body: Buffer;
}

export interface BuildOptions {
  serverId: string;
  generation?: number;
  key: Buffer;
  now?: Date;
  mode?: FailureMode;
}

export function assertSimEnv(nodeEnv: string | undefined): void {
  if (isProductionLike(nodeEnv)) {
    throw new Error(
      'Симулятор запускается только при NODE_ENV=development или test',
    );
  }
}

export function loadScenario(file: string): Scenario {
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Scenario;
  if (
    typeof raw.name !== 'string' ||
    typeof raw.streamId !== 'string' ||
    !Array.isArray(raw.steps) ||
    raw.steps.length === 0
  ) {
    throw new Error('Некорректный сценарий');
  }
  return raw;
}

function substitute(value: unknown, nowIso: string): unknown {
  if (value === '$now') return nowIso;
  if (Array.isArray(value)) return value.map((v) => substitute(v, nowIso));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, substitute(v, nowIso)]),
    );
  }
  return value;
}

interface SimEvent {
  eventId: string;
  type: string;
  serverId: string;
  streamId: string;
  seq: number;
  occurredAt: string;
  data: Record<string, unknown>;
}

function makeEvents(
  scenario: Scenario,
  opts: BuildOptions,
  now: Date,
): SimEvent[] {
  const nowIso = now.toISOString();
  let seq = 1;
  let steps = scenario.steps.map((s) => ({ ...s }));
  if (opts.mode === 'future-type') {
    steps = [{ type: 'inventory.snapshot', data: {} }];
  }
  if (opts.mode === 'batch-101') {
    steps = Array.from({ length: MAX_EVENTS_PER_BATCH + 1 }, () => ({
      type: 'bridge.hello',
      data: scenario.steps[0].data,
    }));
  }
  const events: SimEvent[] = steps.map((s) => ({
    eventId: randomUUID(),
    type: s.type,
    serverId: opts.mode === 'foreign-server' ? 'other-server' : opts.serverId,
    streamId: scenario.streamId,
    seq: seq++,
    occurredAt: nowIso,
    data: substitute(s.data, nowIso) as Record<string, unknown>,
  }));
  if (opts.mode === 'reverse-order') events.reverse();
  if (opts.mode === 'seq-gap') {
    events.forEach((e, i) => (e.seq = i * 10 + 1));
  }
  if (opts.mode === 'oversize') {
    events[0].data = { ...events[0].data, padding: 'x'.repeat(300_000) };
  }
  return events;
}

function signed(
  opts: BuildOptions,
  body: Buffer,
  now: Date,
  nonce: string = randomBytes(16).toString('base64url'),
): SimRequest {
  const keyId = formatKeyId(opts.serverId, opts.generation ?? 1);
  let ts = Math.floor(now.getTime() / 1000);
  if (opts.mode === 'stale-time') ts -= 3600;
  if (opts.mode === 'future-time') ts += 3600;
  const timestamp = String(ts);
  let signature = signRequest(opts.key, {
    keyId,
    timestamp,
    nonce,
    method: 'POST',
    path: PATH_EVENTS,
    body,
  });
  if (opts.mode === 'bad-signature') {
    signature = (signature[0] === '0' ? '1' : '0') + signature.slice(1);
  }
  return {
    method: 'POST',
    path: PATH_EVENTS,
    headers: {
      'content-type': 'application/json',
      [HEADER_KEY_ID]: keyId,
      [HEADER_TIMESTAMP]: timestamp,
      [HEADER_NONCE]: nonce,
      [HEADER_PROTOCOL]: String(BRIDGE_PROTOCOL),
      [HEADER_SIGNATURE]: signature,
    },
    body,
  };
}

/// Собирает подписанные запросы сценария. Для `replay-nonce` второй запрос
/// использует тот же нонс, для `replay-batch` - те же `eventId`, но новый нонс.
export function buildRequests(
  scenario: Scenario,
  opts: BuildOptions,
): SimRequest[] {
  if (!isValidSlug(opts.serverId)) throw new Error('Неверный serverId');
  const now = opts.now ?? new Date();
  const events = makeEvents(scenario, opts, now);
  const body = Buffer.from(
    JSON.stringify({
      schema: BRIDGE_SCHEMA,
      sentAt: now.toISOString(),
      events,
    }),
    'utf8',
  );
  const first = signed(opts, body, now);
  if (opts.mode === 'replay-nonce') {
    return [first, signed(opts, body, now, first.headers[HEADER_NONCE])];
  }
  if (opts.mode === 'replay-batch') return [first, signed(opts, body, now)];
  return [first];
}

async function main() {
  assertSimEnv(process.env.NODE_ENV);
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (cmd !== 'scenario' || !file) {
    throw new Error(
      'Использование: scenario <файл> --server <slug> [--mode <режим>]',
    );
  }
  const read = (flag: string) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const serverId = read('--server') ?? '';
  const mode = read('--mode') as FailureMode | undefined;
  if (mode && !FAILURE_MODES.includes(mode)) {
    throw new Error('Неизвестный режим');
  }
  const secret = process.env.BRIDGE_MASTER_SECRET;
  if (!secret) throw new Error('BRIDGE_MASTER_SECRET не задан');
  const generation = Number(read('--generation') ?? '1');
  const key = deriveServerKey(
    Buffer.from(secret, 'utf8'),
    serverId,
    generation,
  );
  const base =
    process.env.API_URL ?? `http://localhost:${process.env.API_PORT ?? 4000}`;
  const requests = buildRequests(loadScenario(file), {
    serverId,
    generation,
    key,
    mode,
  });
  for (const r of requests) {
    const res = await fetch(`${base}${r.path}`, {
      method: r.method,
      headers: r.headers,
      body: new Uint8Array(r.body),
    });
    console.log(`${res.status} ${await res.text()}`);
  }
}

if (require.main === module) {
  main().catch((e: Error) => {
    console.error(e.message);
    process.exit(1);
  });
}
