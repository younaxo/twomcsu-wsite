/// Контракт публичных итогов и эфира (giveaway/docs/ADR-G003, разделы 6.2 и 8).

export type ResultsMode = 'live' | 'test';

export interface ResultsWinner {
  place: number;
  ticket: string;
  playerName: string;
  prizeName: string;
  /// Имя файла картинки (ключ `prizeImages`) или null - тогда заглушка.
  imageFile: string | null;
}

export interface ResultsDisqualified {
  place: number;
  ticket: string;
  playerName: string;
  prizeName: string;
}

export interface ResultsIdle {
  test: boolean;
  state: 'idle' | 'frozen';
  snapshotHash: string | null;
  ticketCount: number | null;
  revision: number;
}

export interface ResultsReady {
  test: boolean;
  state: 'results';
  snapshotHash: string;
  ticketCount: number;
  revision: number;
  algorithm: string;
  seed: string;
  broadcastAt: string;
  order: { ticket: string; playerName: string }[];
  winners: ResultsWinner[];
  /// Номера мест в порядке показа (от последнего места к первому). Если нет - считаем сами.
  revealOrder?: number[];
  disqualified: ResultsDisqualified[];
}

export type PublicResults = ResultsIdle | ResultsReady;

export type ResultsErrorKind = 'unauthorized' | 'test_disabled' | 'unavailable' | 'unknown';

export class ResultsApiError extends Error {
  readonly kind: ResultsErrorKind;
  constructor(kind: ResultsErrorKind) {
    super(kind);
    this.name = 'ResultsApiError';
    this.kind = kind;
  }
}

/// Сигнал эфира: событие - лишь повод заново запросить итоги.
export interface ResultsStream {
  close(): void;
}

export interface ResultsStreamHandlers {
  onSignal: () => void;
  onOpen: () => void;
  onError: () => void;
}

export interface ResultsApi {
  getResults(mode: ResultsMode, signal?: AbortSignal): Promise<PublicResults>;
  /// null - EventSource недоступен (остаётся опрос).
  openStream(mode: ResultsMode, handlers: ResultsStreamHandlers): ResultsStream | null;
}
