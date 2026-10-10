import type { ConfigService } from '@nestjs/config';

/// CORS allowlist (ADR-0104): явный список origin'ов сайта — один источник
/// для HTTP API и Socket.IO. Без `*` и без шаблонов: запрос с `Origin`, которого
/// нет в списке, получает ответ без `Access-Control-Allow-Origin` (браузер его
/// не отдаст странице), credentials разрешены только своим origin'ам.
///
/// `WEB_ORIGINS` — через запятую (production: `https://twomc.su` и реально
/// используемые официальные поддомены); если не задан — `WEB_ORIGIN`.
/// В production допускается только https (кроме явного localhost для smoke).

export function parseOrigins(
  value: string | undefined,
  production: boolean,
): string[] {
  const items = (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const origins = new Set<string>();
  for (const item of items) {
    if (item.includes('*')) {
      throw new Error(`CORS: шаблоны и «*» запрещены (${item})`);
    }
    let url: URL;
    try {
      url = new URL(item);
    } catch {
      throw new Error(`CORS: некорректный origin «${item}»`);
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      throw new Error(`CORS: только http(s) origin («${item}»)`);
    }
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (production && url.protocol !== 'https:' && !local) {
      throw new Error(`CORS: в production — только https («${item}»)`);
    }
    origins.add(url.origin);
  }
  if (origins.size === 0) {
    throw new Error(
      'CORS: список origin пуст — задайте WEB_ORIGINS или WEB_ORIGIN',
    );
  }
  return [...origins];
}

export function allowedOrigins(config: ConfigService): string[] {
  const production = config.get<string>('NODE_ENV') === 'production';
  const list =
    config.get<string>('WEB_ORIGINS') || config.get<string>('WEB_ORIGIN');
  return parseOrigins(list, production);
}

type OriginCallback = (error: Error | null, allow?: boolean) => void;

/// Проверка origin для cors (express) и socket.io: точное совпадение.
/// Запросы без Origin (тот же сайт, сервер-сервер, curl) — не CORS, пропускаются.
export function corsOrigin(allowed: readonly string[]) {
  const set = new Set(allowed);
  return (origin: string | undefined, callback: OriginCallback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    callback(null, set.has(origin));
  };
}
