import { GIVEAWAY_API_BASE } from './api';
import {
  ResultsApiError,
  type PublicResults,
  type ResultsApi,
  type ResultsMode,
  type ResultsStreamHandlers,
} from './results-types';

type Fetcher = typeof fetch;
type EventSourceCtor = new (url: string, init?: EventSourceInit) => EventSource;

/// Имена событий потока, после которых итоги перечитываются (ADR-G003 п. 8.2).
const SIGNAL_EVENTS = ['results', 'reset', 'ready'] as const;

export function createHttpResultsApi(
  fetcher: Fetcher = (...args) => fetch(...args),
  base: string = GIVEAWAY_API_BASE,
  eventSource: EventSourceCtor | null = typeof EventSource === 'undefined' ? null : EventSource,
): ResultsApi {
  return {
    async getResults(mode: ResultsMode, signal?: AbortSignal): Promise<PublicResults> {
      let response: Response;
      try {
        response = await fetcher(`${base}/public/results?mode=${mode}`, {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
          signal,
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        throw new ResultsApiError('unavailable');
      }
      if (response.status === 401) throw new ResultsApiError('unauthorized');
      if (response.status === 404) throw new ResultsApiError('test_disabled');
      if (!response.ok) throw new ResultsApiError('unavailable');
      try {
        return (await response.json()) as PublicResults;
      } catch {
        throw new ResultsApiError('unknown');
      }
    },
    openStream(mode: ResultsMode, handlers: ResultsStreamHandlers) {
      if (!eventSource) return null;
      const source = new eventSource(`${base}/stream?mode=${mode}`, { withCredentials: false });
      source.onopen = () => handlers.onOpen();
      source.onerror = () => handlers.onError();
      for (const name of SIGNAL_EVENTS) source.addEventListener(name, () => handlers.onSignal());
      // `unauthorized` (тестовый канал): сервер закрывает поток, опрос получит 401.
      source.addEventListener('unauthorized', () => {
        handlers.onError();
        source.close();
      });
      return { close: () => source.close() };
    },
  };
}
