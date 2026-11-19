'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GiveawayApiError,
  type GiveawayApi,
  type GiveawayErrorKind,
  type GiveawayLastAttempt,
  type GiveawayPublicInfo,
} from './types';

/// Интервал опроса статуса кода (ADR-G002 п. 4: раз в 2-3 с, лимит 60/мин).
export const POLL_INTERVAL_MS = 2500;
/// Пауза после 429 на опросе, если сервер не прислал Retry-After.
export const POLL_BACKOFF_MS = 15_000;
const POLL_RETRY_MS = 5000;
const MAX_TIMEOUT_MS = 3_600_000;

export type InfoState =
  | { kind: 'loading' }
  | { kind: 'ready'; info: GiveawayPublicInfo }
  | { kind: 'error'; error: GiveawayErrorKind };

export type CodeView =
  | { kind: 'idle' }
  | { kind: 'issuing' }
  /// `code === null`: код выдан раньше (до перезагрузки страницы) и больше не показывается.
  | {
      kind: 'pending';
      code: string | null;
      expiresAtMs: number;
      /// Игра ответила «время не набрано»: код действует, играйте дальше.
      lastAttempt: GiveawayLastAttempt | null;
    }
  /// `animate`: билет только что получен - играем анимацию перебора символов.
  | { kind: 'ticket'; ticket: string; playerName: string; animate: boolean; previously: boolean }
  | { kind: 'expired' }
  | { kind: 'error'; error: GiveawayErrorKind; retryAfterSeconds: number | null };

export interface UseGiveawayOptions {
  /// Выдать код сразу после загрузки (только режим предпросмотра моков).
  autoIssue?: boolean;
}

export interface UseGiveaway {
  info: InfoState;
  view: CodeView;
  /// Опрос статуса временно замедлен или не удался.
  pollIssue: GiveawayErrorKind | null;
  issue: () => void;
  reload: () => void;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function toKind(error: unknown): GiveawayErrorKind {
  return error instanceof GiveawayApiError ? error.kind : 'unknown';
}

function toErrorView(error: unknown): CodeView {
  return {
    kind: 'error',
    error: toKind(error),
    retryAfterSeconds: error instanceof GiveawayApiError ? error.retryAfterSeconds : null,
  };
}

export function useGiveaway(api: GiveawayApi, options: UseGiveawayOptions = {}): UseGiveaway {
  const [info, setInfo] = useState<InfoState>({ kind: 'loading' });
  const [view, setView] = useState<CodeView>({ kind: 'idle' });
  const [pollIssue, setPollIssue] = useState<GiveawayErrorKind | null>(null);
  const issuing = useRef(false);

  const loadInfo = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await api.getPublic(signal);
        setInfo({ kind: 'ready', info: data });
      } catch (error) {
        if (isAbort(error)) return;
        setInfo((prev) => (prev.kind === 'ready' ? prev : { kind: 'error', error: toKind(error) }));
      }
    },
    [api],
  );

  const issue = useCallback(() => {
    if (issuing.current) return;
    issuing.current = true;
    setView({ kind: 'issuing' });
    setPollIssue(null);
    api
      .issueCode()
      .then((issued) => {
        setView({
          kind: 'pending',
          code: issued.code,
          expiresAtMs: Date.parse(issued.expiresAt),
          lastAttempt: null,
        });
      })
      .catch((error: unknown) => setView(toErrorView(error)))
      .finally(() => {
        issuing.current = false;
      });
  }, [api]);

  const autoIssue = options.autoIssue === true;

  // Первичная загрузка: публичные данные и статус кода сессии (билет мог быть получен раньше).
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setInfo((prev) => (prev.kind === 'ready' ? prev : { kind: 'loading' }));
    void loadInfo(controller.signal);
    api
      .getStatus(controller.signal)
      .then((status) => {
        if (status.status === 'redeemed') {
          setView({
            kind: 'ticket',
            ticket: status.ticket,
            playerName: status.playerName,
            animate: false,
            previously: true,
          });
        } else if (status.status === 'pending') {
          setView({
            kind: 'pending',
            code: null,
            expiresAtMs: Date.parse(status.expiresAt),
            lastAttempt: status.lastAttempt ?? null,
          });
        } else if (autoIssue) {
          issue();
        }
      })
      .catch((error: unknown) => {
        if (!isAbort(error) && autoIssue) issue();
      });
    return () => controller.abort();
  }, [api, loadInfo, reloadKey, autoIssue, issue]);

  // Границы розыгрыша: при наступлении старта/отсечки перечитываем публичные данные.
  const infoData = info.kind === 'ready' ? info.info : null;
  useEffect(() => {
    if (!infoData || infoData.status === 'finished') return;
    const target = Date.parse(
      infoData.status === 'before' ? infoData.startAtUtc : infoData.cutoffAtUtc,
    );
    if (Number.isNaN(target)) return;
    const delay = Math.min(Math.max(target - Date.now(), 0) + 500, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => void loadInfo(), delay);
    return () => clearTimeout(timer);
  }, [infoData, loadInfo]);

  // Опрос статуса: только пока код pending и вкладка видима; стоп по истечении.
  const pendingExpiry = view.kind === 'pending' ? view.expiresAtMs : null;
  useEffect(() => {
    if (pendingExpiry === null) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let inflight: AbortController | null = null;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = null;
    };
    const schedule = (ms: number) => {
      clear();
      if (stopped || document.visibilityState === 'hidden') return;
      timer = setTimeout(() => void poll(), ms);
    };
    const finish = (next: CodeView) => {
      stopped = true;
      clear();
      inflight?.abort();
      setPollIssue(null);
      setView(next);
    };
    const poll = async () => {
      if (stopped) return;
      const expired = Date.now() >= pendingExpiry;
      inflight = new AbortController();
      try {
        const status = await api.getStatus(inflight.signal);
        if (stopped) return;
        if (status.status === 'redeemed') {
          finish({
            kind: 'ticket',
            ticket: status.ticket,
            playerName: status.playerName,
            animate: true,
            previously: false,
          });
          return;
        }
        if (expired || status.status === 'expired' || status.status === 'none') {
          finish({ kind: 'expired' });
          return;
        }
        setPollIssue(null);
        const attempt = status.status === 'pending' ? (status.lastAttempt ?? null) : null;
        setView((prev) =>
          prev.kind === 'pending' && JSON.stringify(prev.lastAttempt) !== JSON.stringify(attempt)
            ? { ...prev, lastAttempt: attempt }
            : prev,
        );
        schedule(POLL_INTERVAL_MS);
      } catch (error) {
        if (stopped || isAbort(error)) return;
        if (expired) {
          finish({ kind: 'expired' });
          return;
        }
        const kind = toKind(error);
        setPollIssue(kind);
        const retry =
          error instanceof GiveawayApiError && error.kind === 'rate_limited'
            ? (error.retryAfterSeconds ?? POLL_BACKOFF_MS / 1000) * 1000
            : POLL_RETRY_MS;
        schedule(retry);
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        clear();
        void poll();
      } else {
        clear();
        inflight?.abort();
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    // Таймер истечения: ровно в момент TTL делаем последнюю проверку и останавливаемся.
    const expiryTimer = setTimeout(
      () => {
        clear();
        void poll();
      },
      Math.min(Math.max(pendingExpiry - Date.now(), 0) + 200, MAX_TIMEOUT_MS),
    );
    schedule(POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clear();
      clearTimeout(expiryTimer);
      inflight?.abort();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [api, pendingExpiry]);

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  return { info, view, pollIssue, issue, reload };
}
