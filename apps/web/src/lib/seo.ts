import { API_URL } from '@/lib/env';

/// SEO на сервере (срез 8.4, ADR-0126): публичные данные API для метаданных и
/// sitemap. API недоступен (сборка без API, сбой) — `null`, страница строится
/// со значениями по умолчанию; ожидание ограничено, чтобы не держать рендер.
export async function fetchPublic<T>(path: string, revalidate: number): Promise<T | null> {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export interface PublicSiteMeta {
  meta?: { title?: string | null; description?: string | null; keywords?: string[] | null };
}

export const DEFAULT_DESCRIPTION =
  'twomc.su — Minecraft-проект с собственными серверами, уникальными механиками, магазином и живым сообществом.';

/// Заголовок записи по slug для `generateMetadata` динамических страниц
/// (товар, новость, сервер…): `title` или `name` из публичного API. Нет данных
/// (API недоступен, 404) — `fallback`. Кэш 5 минут, как у настроек сайта.
export async function fetchEntityTitle(path: string, fallback: string): Promise<string> {
  const entity = await fetchPublic<{ title?: unknown; name?: unknown }>(path, 300);
  const raw = typeof entity?.title === 'string' ? entity.title : entity?.name;
  const title = typeof raw === 'string' ? raw.trim() : '';
  return title ? title.slice(0, 120) : fallback;
}
