import { existsSync, readFileSync } from 'fs';
import { dirname, join, resolve } from 'path';

/// Призы розыгрыша: единственный источник - `giveaway/config/prizes.json`
/// (решение владельца Q97, ADR-G003 п. 5.5). Файл читается и проверяется один
/// раз при старте; при ошибке приложение не стартует (fail closed).

export interface ConfigPrize {
  place: number;
  title: string;
  description: string;
  image: string;
}

export const GIVEAWAY_PRIZES_CONFIG = Symbol('GIVEAWAY_PRIZES_CONFIG');
export const DEFAULT_PRIZES_CONFIG_REL = 'giveaway/config/prizes.json';
export const MAX_CONFIG_PLACES = 100;
/// Название приза хранится в `giveaway_winners.prizeName` VarChar(80).
export const MAX_PRIZE_TITLE = 80;
export const PRIZE_CONFIG_IMAGE_PATTERN =
  /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}\.(svg|png)$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/// Проверка содержимого файла. Лишние поля (value, showValue, podium и др. -
/// для web) игнорируются; возвращает призы по возрастанию места.
export function parsePrizesConfig(input: unknown): ConfigPrize[] {
  const fail = (m: string): never => {
    throw new Error(`prizes config: ${m}`);
  };
  if (!isObj(input)) return fail('ожидается объект');
  const list = input.prizes;
  if (!Array.isArray(list) || list.length === 0) return fail('prizes пуст');
  if (list.length > MAX_CONFIG_PLACES) return fail('слишком много мест');
  const out = list.map((p: unknown, i: number): ConfigPrize => {
    if (!isObj(p)) return fail(`prizes[${i}] не объект`);
    const { place, title, description, image } = p;
    if (typeof place !== 'number' || !Number.isInteger(place) || place < 1) {
      return fail(`prizes[${i}].place`);
    }
    if (
      typeof title !== 'string' ||
      title.trim() === '' ||
      title.length > MAX_PRIZE_TITLE
    ) {
      return fail(`prizes[${i}].title`);
    }
    if (typeof description !== 'string') {
      return fail(`prizes[${i}].description`);
    }
    if (typeof image !== 'string' || !PRIZE_CONFIG_IMAGE_PATTERN.test(image)) {
      return fail(`prizes[${i}].image`);
    }
    return { place, title, description, image };
  });
  out.sort((a, b) => a.place - b.place);
  if (out.some((p, i) => p.place !== i + 1)) {
    fail('места должны идти 1..N без пропусков и повторов');
  }
  return out;
}

/// Путь к конфигу: `GIVEAWAY_PRIZES_CONFIG` (относительно cwd) или
/// `giveaway/config/prizes.json` от корня репозитория (поиск вверх от cwd).
export function resolvePrizesConfigPath(
  configured: string | null,
  cwd: string = process.cwd(),
): string {
  if (configured !== null) return resolve(cwd, configured);
  let dir = resolve(cwd);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, DEFAULT_PRIZES_CONFIG_REL);
    if (existsSync(candidate)) return candidate;
    const up = dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return resolve(cwd, '../..', DEFAULT_PRIZES_CONFIG_REL);
}

export function loadPrizesConfig(
  configured: string | null,
  cwd: string = process.cwd(),
): ConfigPrize[] {
  const path = resolvePrizesConfigPath(configured, cwd);
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new Error('prizes config: файл не читается');
  }
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error('prizes config: невалидный JSON');
  }
  return parsePrizesConfig(json);
}
