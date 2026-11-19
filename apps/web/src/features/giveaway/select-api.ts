import { createHttpGiveawayApi } from './api';
import type { MockScenario } from './mock-api';
import type { GiveawayApi } from './types';

/// Моки разрешены только вне production и только по явному флагу.
/// `process.env.NODE_ENV` инлайнится при сборке: в production ветка с моками
/// становится мёртвым кодом и вырезается.
export function mockEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_GIVEAWAY_MOCK === '1';
}

export interface SelectedApi {
  api: GiveawayApi;
  /// В режиме предпросмотра код выдаётся автоматически (для сценариев со снимками).
  autoIssue: boolean;
  mock: MockScenario | null;
}

/// Выбор клиента: реальный HTTP-клиент в production-пути; в dev с флагом -
/// мок по `?mock=<сценарий>` (по умолчанию `running`).
export async function selectApi(search: string): Promise<SelectedApi> {
  if (mockEnabled()) {
    const { createMockGiveawayApi, isMockScenario } = await import('./mock-api');
    const raw = new URLSearchParams(search).get('mock');
    const scenario: MockScenario = isMockScenario(raw) ? raw : 'running';
    return {
      api: createMockGiveawayApi(scenario),
      autoIssue:
        scenario === 'pending' ||
        scenario === 'ticket' ||
        scenario === 'limit' ||
        scenario === 'not_enough',
      mock: scenario,
    };
  }
  return { api: createHttpGiveawayApi(), autoIssue: false, mock: null };
}
