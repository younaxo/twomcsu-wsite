/// Моки API розыгрыша: ТОЛЬКО для разработки и тестов. Подключаются из
/// `select-api.ts` лишь при `NODE_ENV !== 'production'` и
/// `NEXT_PUBLIC_GIVEAWAY_MOCK=1`; в production-сборку этот модуль не попадает.
import {
  GiveawayApiError,
  type GiveawayApi,
  type GiveawayCodeStatus,
  type GiveawayPhase,
  type GiveawayPublicInfo,
} from './types';
import { formatMsk } from './format';

export const MOCK_SCENARIOS = [
  'before',
  'running',
  'pending',
  'ticket',
  'redeemed',
  'expired',
  'limit',
  'down',
  'offline',
  'finished',
  'not_enough',
  'results',
  'results-test',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function isMockScenario(value: string | null | undefined): value is MockScenario {
  return (MOCK_SCENARIOS as readonly string[]).includes(value ?? '');
}

const DAY = 86_400_000;
const MOCK_CODE = 'K7M2-9QXR-4TBW-H0ZD';

function publicInfo(status: GiveawayPhase): GiveawayPublicInfo {
  const now = Date.now();
  const offsets: Record<GiveawayPhase, [number, number]> = {
    before: [3 * DAY + 4 * 3_600_000 + 5 * 60_000, 41 * DAY],
    running: [-2 * DAY, 38 * DAY],
    finished: [-40 * DAY, -1 * DAY],
  };
  const [start, cutoff] = offsets[status];
  const startAtUtc = new Date(now + start).toISOString();
  const cutoffAtUtc = new Date(now + cutoff).toISOString();
  return {
    status,
    thresholdMinutes: 3000,
    thresholdHours: 50,
    startAtUtc,
    cutoffAtUtc,
    startAtMsk: formatMsk(startAtUtc),
    cutoffAtMsk: formatMsk(cutoffAtUtc),
    ticketsIssued: status === 'before' ? 0 : 1284,
  };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createMockGiveawayApi(scenario: MockScenario): GiveawayApi {
  const phase: GiveawayPhase =
    scenario === 'before'
      ? 'before'
      : scenario === 'finished' || scenario === 'results' || scenario === 'results-test'
        ? 'finished'
        : 'running';
  let issuedAt: number | null = null;
  let polls = 0;

  return {
    async getPublic() {
      await wait(150);
      if (scenario === 'offline') throw new GiveawayApiError('network');
      if (scenario === 'down') throw new GiveawayApiError('unavailable');
      return publicInfo(phase);
    },
    async issueCode() {
      await wait(250);
      if (scenario === 'limit') throw new GiveawayApiError('rate_limited', 120);
      issuedAt = Date.now();
      polls = 0;
      return {
        code: MOCK_CODE,
        expiresAt: new Date(issuedAt + 600_000).toISOString(),
        ttlSeconds: 600,
      };
    },
    async getStatus(): Promise<GiveawayCodeStatus> {
      await wait(100);
      if (scenario === 'redeemed') {
        return { status: 'redeemed', ticket: 'K417', playerName: 'Steve' };
      }
      if (scenario === 'expired' && issuedAt === null) return { status: 'expired' };
      if (issuedAt === null) return { status: 'none' };
      polls += 1;
      if (scenario === 'not_enough') {
        // Игра ответила «время не набрано»: 28 ч 30 мин из 50 ч, осталось 21 ч 30 мин.
        return {
          status: 'pending',
          expiresAt: new Date(issuedAt + 600_000).toISOString(),
          lastAttempt: {
            result: 'not_enough',
            minutes: 1710,
            remainingMinutes: 1290,
            thresholdMinutes: 3000,
          },
        };
      }
      if (scenario === 'ticket' && polls >= 2) {
        return { status: 'redeemed', ticket: 'K417', playerName: 'Steve' };
      }
      return { status: 'pending', expiresAt: new Date(issuedAt + 600_000).toISOString() };
    },
  };
}
