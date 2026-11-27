/// Фиксированное окно по slug: защита от CPU-DoS на проверке секрета при
/// переборе с множества адресов (лимит по IP — в @Throttle маршрута). Счётчик
/// в памяти процесса; лимит одинаков для известных и неизвестных slug, чтобы
/// не раскрывать существование сайта. Размер карты ограничен.
export class SlugRateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit = 300,
    private readonly windowMs = 60_000,
    private readonly maxKeys = 5_000,
  ) {}

  /// true — запрос допустим, false — лимит окна исчерпан.
  allow(slug: string, now = Date.now()): boolean {
    const entry = this.hits.get(slug);
    if (!entry || now - entry.start >= this.windowMs) {
      if (!entry && this.hits.size >= this.maxKeys) {
        this.purge(now);
        if (this.hits.size >= this.maxKeys) return true;
      }
      this.hits.set(slug, { start: now, count: 1 });
      return true;
    }
    entry.count += 1;
    return entry.count <= this.limit;
  }

  private purge(now: number): void {
    for (const [key, value] of this.hits) {
      if (now - value.start >= this.windowMs) this.hits.delete(key);
    }
  }
}
