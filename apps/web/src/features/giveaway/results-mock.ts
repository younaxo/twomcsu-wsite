/// Мок итогов и эфира: ТОЛЬКО для разработки (подключается из `select-api.ts`
/// динамическим `import()` за проверкой моков; в production не попадает).
import { prizesConfig } from './prizes';
import type { MockScenario } from './mock-api';
import {
  ResultsApiError,
  type PublicResults,
  type ResultsApi,
  type ResultsMode,
  type ResultsReady,
} from './results-types';

const NAMES = ['Steve', 'Alex_77', 'Creeper', 'Notch_fan', 'Herobrine', 'Zombie', 'Ender', 'Wolf', 'Ghast', 'Piglin'];
const TICKETS = ['K417', 'B002', 'W640', 'A001', 'P777', 'H808', 'M250', 'Z999', 'T100', 'C333'];

export function mockResultsReady(test: boolean): ResultsReady {
  const winners = prizesConfig.prizes.slice(0, 10).map((prize, i) => ({
    place: prize.place,
    ticket: TICKETS[i]!,
    playerName: NAMES[i]!,
    prizeName: prize.title,
    imageFile: prize.image,
  }));
  return {
    test,
    state: 'results',
    snapshotHash: '0436be4eeadab96d00085c89cc04a3bfb2880edbb38e1ba5d9ca444fb8ce1996',
    ticketCount: 1284,
    revision: 1,
    algorithm: 'twomc-giveaway-draw-v1',
    seed: '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f',
    broadcastAt: new Date().toISOString(),
    order: TICKETS.map((ticket, i) => ({ ticket, playerName: NAMES[i]! })),
    winners,
    revealOrder: winners.map((w) => w.place).sort((a, b) => b - a),
    disqualified: [],
  };
}

export function createMockResultsApi(scenario: MockScenario): ResultsApi {
  const results = scenario === 'results' || scenario === 'results-test';
  return {
    async getResults(mode: ResultsMode): Promise<PublicResults> {
      if (!results) {
        if (mode === 'test') throw new ResultsApiError('unauthorized');
        return { test: false, state: 'idle', snapshotHash: null, ticketCount: null, revision: 0 };
      }
      return mockResultsReady(scenario === 'results-test');
    },
    openStream: () => null,
  };
}
