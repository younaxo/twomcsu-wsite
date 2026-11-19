/// Контракт публичного API розыгрыша (giveaway/docs/ADR-G002, разделы 3-5).

export type GiveawayPhase = 'before' | 'running' | 'finished';

export interface GiveawayPublicInfo {
  status: GiveawayPhase;
  thresholdMinutes: number;
  thresholdHours: number;
  startAtUtc: string;
  cutoffAtUtc: string;
  startAtMsk: string;
  cutoffAtMsk: string;
  ticketsIssued: number;
}

export interface GiveawayIssuedCode {
  /// Показывается один раз, вид XXXX-XXXX-XXXX-XXXX.
  code: string;
  expiresAt: string;
  ttlSeconds: number;
}

/// Последняя попытка ввода кода в игре: времени не хватило (код остаётся действующим).
export interface GiveawayLastAttempt {
  result: 'not_enough';
  /// Сколько минут наиграно.
  minutes: number;
  remainingMinutes: number;
  thresholdMinutes: number;
}

export type GiveawayCodeStatus =
  | { status: 'none' }
  | { status: 'pending'; expiresAt: string; lastAttempt?: GiveawayLastAttempt | null }
  | { status: 'redeemed'; ticket: string; playerName: string }
  | { status: 'expired' };

export interface GiveawayApi {
  getPublic(signal?: AbortSignal): Promise<GiveawayPublicInfo>;
  issueCode(signal?: AbortSignal): Promise<GiveawayIssuedCode>;
  getStatus(signal?: AbortSignal): Promise<GiveawayCodeStatus>;
}

export type GiveawayErrorKind = 'rate_limited' | 'unavailable' | 'network' | 'unknown';

export class GiveawayApiError extends Error {
  readonly kind: GiveawayErrorKind;
  readonly retryAfterSeconds: number | null;
  constructor(kind: GiveawayErrorKind, retryAfterSeconds: number | null = null) {
    super(kind);
    this.name = 'GiveawayApiError';
    this.kind = kind;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
