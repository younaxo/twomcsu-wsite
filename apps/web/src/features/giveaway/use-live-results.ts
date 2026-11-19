'use client';

import { useEffect, useRef, useState } from 'react';
import {
  ResultsApiError,
  type PublicResults,
  type ResultsApi,
  type ResultsErrorKind,
  type ResultsMode,
} from './results-types';

/// Запасной опрос итогов, пока поток SSE недоступен (ADR-G003 п. 8.2).
export const RESULTS_POLL_MS = 5000;

export type LiveResultsState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: PublicResults }
  | { kind: 'error'; error: ResultsErrorKind };

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/// Итоги эфира: первичный запрос, SSE-сигналы (повторный запрос), опрос раз в 5 с
/// только при ошибке потока (или если EventSource нет). Данные не теряются при сбоях.
export function useLiveResults(api: ResultsApi, mode: ResultsMode): LiveResultsState {
  const [state, setState] = useState<LiveResultsState>({ kind: 'loading' });
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let stopped = false;
    let inflight: AbortController | null = null;
    setState({ kind: 'loading' });

    const load = async () => {
      inflight?.abort();
      const controller = new AbortController();
      inflight = controller;
      try {
        const data = await api.getResults(mode, controller.signal);
        if (stopped) return;
        setState((prev) =>
          prev.kind === 'ready' &&
          prev.data.revision === data.revision &&
          prev.data.state === data.state
            ? prev
            : { kind: 'ready', data },
        );
      } catch (error) {
        if (stopped || isAbort(error)) return;
        const kind = error instanceof ResultsApiError ? error.kind : 'unknown';
        setState((prev) => (prev.kind === 'ready' ? prev : { kind: 'error', error: kind }));
        if (kind === 'unauthorized' || kind === 'test_disabled') stopPolling();
      }
    };
    const startPolling = () => {
      if (pollTimer.current !== null) return;
      pollTimer.current = setInterval(() => void load(), RESULTS_POLL_MS);
    };
    const stopPolling = () => {
      if (pollTimer.current !== null) clearInterval(pollTimer.current);
      pollTimer.current = null;
    };

    void load();
    const stream = api.openStream(mode, {
      onSignal: () => void load(),
      onOpen: () => {
        stopPolling();
        void load();
      },
      onError: startPolling,
    });
    if (stream === null) startPolling();

    return () => {
      stopped = true;
      inflight?.abort();
      stopPolling();
      stream?.close();
    };
  }, [api, mode]);

  return state;
}
