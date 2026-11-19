import raw from '../../../../../giveaway/config/prizes.json';

/// Единственный источник призов - `giveaway/config/prizes.json` (импорт по
/// относительному пути из корня репозитория, без копий; см. giveaway/README.md).

export interface Prize {
  place: number;
  title: string;
  description: string;
  image: string;
  /** Служебная оценка; на странице не показывается, пока showValue=false. */
  value: number;
  showValue: boolean;
}

export interface PrizesConfig {
  showValue: boolean;
  texts: { heading: string; intro: string };
  podium: { order: number[]; heights: Record<string, number> };
  rest: { order: number[] };
  prizes: Prize[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/// Ручная валидация (zod в web не подключён). Бросает Error с понятным текстом.
export function validatePrizesConfig(input: unknown): PrizesConfig {
  const fail = (m: string): never => {
    throw new Error(`prizes.json: ${m}`);
  };
  if (!isObj(input)) return fail('ожидается объект');
  if (typeof input.showValue !== 'boolean') fail('showValue должен быть boolean');
  const texts = input.texts;
  if (!isObj(texts) || !isStr(texts.heading) || !isStr(texts.intro)) fail('texts.heading/intro');
  const podium = input.podium as { order: unknown[]; heights: Record<string, unknown> };
  const rest = input.rest as { order: unknown[] };
  if (!isObj(input.podium) || !Array.isArray(podium.order) || !isObj(podium.heights))
    fail('podium');
  if (!isObj(input.rest) || !Array.isArray(rest.order)) fail('rest.order');
  if (!Array.isArray(input.prizes) || input.prizes.length === 0) fail('prizes пуст');
  const prizes = (input.prizes as unknown[]).map((p, i) => {
    if (!isObj(p)) return fail(`prizes[${i}] не объект`);
    if (!Number.isInteger(p.place) || (p.place as number) < 1) fail(`prizes[${i}].place`);
    if (!isStr(p.title) || !isStr(p.description) || !isStr(p.image)) fail(`prizes[${i}] тексты`);
    if (!isNum(p.value) || p.value < 0) fail(`prizes[${i}].value`);
    if (typeof p.showValue !== 'boolean') fail(`prizes[${i}].showValue`);
    return p as unknown as Prize;
  });
  const places = prizes.map((p) => p.place).sort((a, b) => a - b);
  if (places.some((p, i) => p !== i + 1)) fail('места должны идти 1..N без пропусков и повторов');
  const podiumOrder = podium.order as unknown[];
  const restOrder = rest.order as unknown[];
  const all = [...podiumOrder, ...restOrder];
  if (all.length !== prizes.length || !all.every((n) => places.includes(n as number))) {
    fail('podium.order и rest.order должны покрывать все места ровно один раз');
  }
  if (new Set(all).size !== all.length) fail('место повторяется в раскладке');
  for (const n of podiumOrder) {
    if (!isNum((podium.heights as Record<string, unknown>)[String(n)])) {
      fail(`podium.heights[${String(n)}] не число`);
    }
  }
  return input as unknown as PrizesConfig;
}

export const prizesConfig: PrizesConfig = validatePrizesConfig(raw);
