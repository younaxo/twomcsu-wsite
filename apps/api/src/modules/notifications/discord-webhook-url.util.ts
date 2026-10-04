/// Discord webhook URL задаётся пользователем (личный вебхук) или админом
/// (системный) и сервер сам делает на него HTTP POST — без allowlist хоста
/// это классический SSRF (можно подсунуть внутренний адрес вместо
/// discord.com). Разрешён только официальный путь Discord-вебхуков по https.
const ALLOWED_HOSTS = new Set(['discord.com', 'discordapp.com']);

export function isValidDiscordWebhookUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    ALLOWED_HOSTS.has(url.hostname) &&
    /^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)
  );
}
