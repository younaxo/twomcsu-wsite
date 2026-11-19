/// Контракт админ-API розыгрыша (giveaway/docs/ADR-G003, разделы 5-7).

export type AdminMode = 'live' | 'test';

export interface AdminSession {
  discordId: string;
  discordName: string;
  /// Значение заголовка X-Giveaway-Csrf для изменяющих запросов.
  csrfToken: string;
  expiresAt: string;
  idleTimeoutS: number;
  testModeEnabled: boolean;
}

export interface AdminTicket {
  ticket: string;
  playerName: string;
  playerUuid: string;
  issuedAt: string;
}

export interface AdminPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AdminPlayer {
  playerUuid: string;
  playerName: string | null;
  ticket: string | null;
  totalMinutes: number;
  thresholdMinutes: number;
  /// По датам МСК (`YYYY-MM-DD`).
  days: { day: string; minutes: number }[];
  test: boolean;
}

export interface AdminSettings {
  thresholdMinutes: number;
  startAtUtc: string;
  cutoffAtUtc: string;
  startAtMsk: string;
  cutoffAtMsk: string;
  started: boolean;
  drawFrozen: boolean;
}

export interface AdminSettingsPatch {
  thresholdMinutes?: number;
  startAt?: string;
  cutoffAt?: string;
}

export interface AdminPrize {
  id: string;
  name: string;
  quantity: number;
  imageFile: string | null;
  priority: number;
  place: number;
  description: string;
}

export type AdminDrawStatus = 'none' | 'frozen' | 'calculated' | 'broadcast';

export interface AdminWinner {
  id: string;
  place: number;
  orderIndex: number;
  ticket: string;
  playerName: string;
  playerUuid: string;
  prizeName: string;
  imageFile: string | null;
  status: 'active' | 'disqualified';
  disqualifyReason: string | null;
  replacesWinnerId: string | null;
  totalMinutes: number;
}

export interface AdminDraw {
  mode: AdminMode;
  test: boolean;
  status: AdminDrawStatus;
  canFreeze: boolean;
  snapshotHash: string | null;
  ticketCount: number;
  frozenAt: string | null;
  algorithm: string;
  seed: string | null;
  calculatedAt: string | null;
  broadcastAt: string | null;
  revision: number;
  order?: { ticket: string; playerName: string }[];
  winners?: AdminWinner[];
  revealOrder?: number[];
}

export interface AdminAuditEntry {
  id: string;
  at: string;
  actor: string;
  action: string;
  objectType: string | null;
  objectId: string | null;
  mode: string | null;
  detail: string | null;
}

export interface AdminTestTimeBody {
  playerName: string;
  minutes: number;
  day?: string;
}

export interface AdminApi {
  session(): Promise<AdminSession>;
  logout(): Promise<void>;
  tickets(q: {
    mode: AdminMode;
    q: string;
    page: number;
    pageSize: number;
  }): Promise<AdminPage<AdminTicket>>;
  player(uuid: string, mode: AdminMode): Promise<AdminPlayer>;
  settings(): Promise<AdminSettings>;
  patchSettings(body: AdminSettingsPatch): Promise<AdminSettings>;
  prizes(): Promise<{ items: AdminPrize[] }>;
  draw(mode: AdminMode): Promise<AdminDraw>;
  freeze(mode: AdminMode): Promise<AdminDraw>;
  calculate(mode: AdminMode, snapshotHash: string, confirm: string): Promise<AdminDraw>;
  broadcast(mode: AdminMode): Promise<AdminDraw>;
  disqualify(
    mode: AdminMode,
    winnerId: string,
    reason: string,
  ): Promise<{ replacement: AdminWinner | null; draw: AdminDraw }>;
  testTime(body: AdminTestTimeBody): Promise<{ playerName: string; totalMinutes: number }>;
  testTickets(playerName: string): Promise<{
    ticket: string;
    playerName: string;
    totalMinutes: number;
  }>;
  testSeed(count: number): Promise<{ created: number }>;
  testReset(): Promise<{ reset: boolean }>;
  audit(page: number, pageSize: number): Promise<AdminPage<AdminAuditEntry>>;
}

export class AdminApiError extends Error {
  readonly status: number;
  /// Код ошибки бэкенда (`{"error":"<код>"}`) или служебный: `network`, `unknown`.
  readonly code: string;
  constructor(status: number, code: string) {
    super(code);
    this.name = 'AdminApiError';
    this.status = status;
    this.code = code;
  }
}

/// Фраза подтверждения необратимого «Рассчитать» (ADR-G003 п. 5.8).
export const CALCULATE_PHRASE = 'РАССЧИТАТЬ';
