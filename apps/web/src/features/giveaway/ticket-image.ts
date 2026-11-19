import { formatMsk } from './format';

/// PNG билета на клиенте (canvas): без обращений к серверу. Стиль сайта:
/// сплошные поверхности, акцентный оранжевый, без свечения и размытия.

export const TICKET_SITE = 'giveaway.twomc.su';
export const TICKET_TITLE = 'Розыгрыш на «Анархии Новой Эры»';
const WIDTH = 1200;
const HEIGHT = 630;
const MONO = 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const SANS = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';

export interface TicketImageData {
  ticket: string;
  playerName: string;
  /// UTC ISO; дата в PNG показывается по МСК.
  issuedAt?: string | null;
}

export function ticketFileName(ticket: string): string {
  return `twomc-ticket-${ticket}.png`;
}

/// Цвет из токена сайта (тройка `r g b` в CSS-переменной) с запасным значением.
function tokenColor(name: string, fallback: string): string {
  let raw = '';
  if (typeof document !== 'undefined') {
    raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
  }
  const triple = /^\d+\s+\d+\s+\d+$/.test(raw) ? raw : fallback;
  return `rgb(${triple.split(/\s+/).join(',')})`;
}

export function drawTicket(ctx: CanvasRenderingContext2D, data: TicketImageData): void {
  const bg = tokenColor('background', '23 23 21');
  const surface = tokenColor('surface', '31 31 29');
  const fg = tokenColor('foreground', '240 238 233');
  const muted = tokenColor('muted-foreground', '172 168 160');
  const primary = tokenColor('primary', '248 122 48');

  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = surface;
  ctx.fillRect(40, 40, WIDTH - 80, HEIGHT - 80);
  ctx.fillStyle = primary;
  ctx.fillRect(40, 40, 12, HEIGHT - 80);

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.fillStyle = muted;
  ctx.font = `600 30px ${SANS}`;
  ctx.fillText('TwoMC', 100, 120);
  ctx.fillStyle = fg;
  ctx.font = `700 40px ${SANS}`;
  ctx.fillText(TICKET_TITLE, 100, 176);

  ctx.textAlign = 'center';
  ctx.fillStyle = primary;
  ctx.font = `800 220px ${MONO}`;
  ctx.fillText(data.ticket, WIDTH / 2, 390);

  ctx.fillStyle = fg;
  ctx.font = `600 40px ${SANS}`;
  ctx.fillText(`Игрок: ${data.playerName}`, WIDTH / 2, 463);
  const date = data.issuedAt ? formatMsk(data.issuedAt) : '';
  if (date) {
    ctx.fillStyle = muted;
    ctx.font = `400 30px ${SANS}`;
    ctx.fillText(`Получен: ${date}`, WIDTH / 2, 515);
  }
  ctx.textAlign = 'right';
  ctx.fillStyle = muted;
  ctx.font = `500 30px ${SANS}`;
  ctx.fillText(TICKET_SITE, WIDTH - 90, HEIGHT - 80);
}

export async function renderTicketPng(data: TicketImageData): Promise<Blob> {
  if (typeof document !== 'undefined' && document.fonts?.ready) {
    await document.fonts.ready.catch(() => undefined);
  }
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  drawTicket(ctx, data);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png_failed'))), 'image/png');
  });
}

/// Скачивает PNG: ссылка с `download`, объект-URL освобождается сразу после клика.
export async function saveTicketPng(data: TicketImageData): Promise<string> {
  const blob = await renderTicketPng(data);
  const url = URL.createObjectURL(blob);
  const name = ticketFileName(data.ticket);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return name;
}

export function trackingUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/giveaway/ticket/${token}`;
}
