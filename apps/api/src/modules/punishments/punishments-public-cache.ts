/// Процессный кэш публичного слоя (контракт 6.2): до 100 ключей с вытеснением
/// LRU, TTL 5 с, объединение одинаковых параллельных запросов (single-flight).
/// Хранит уже собранный публичный ответ, а не строки с причиной.

export const PUBLIC_CACHE_MAX_KEYS = 100;
export const PUBLIC_CACHE_TTL_MS = 5000;

interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class PublicPunishmentsCache<T> {
  private readonly entries = new Map<string, Entry<T>>();
  private readonly inflight = new Map<string, Promise<T>>();
  /// Поколение: сброс во время загрузки не даёт записать устаревший результат.
  private generation = 0;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly maxKeys: number = PUBLIC_CACHE_MAX_KEYS,
    private readonly ttlMs: number = PUBLIC_CACHE_TTL_MS,
  ) {}

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.generation += 1;
    this.entries.clear();
    this.inflight.clear();
  }

  async getOrLoad(key: string, loader: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expiresAt > this.now()) {
      // LRU: обращение переносит ключ в конец.
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit.value;
    }
    if (hit) this.entries.delete(key);
    const pending = this.inflight.get(key);
    if (pending) return pending;

    const generation = this.generation;
    const self: { p?: Promise<T> } = {};
    const promise: Promise<T> = (async () => {
      try {
        const value = await loader();
        if (generation === this.generation) {
          this.entries.set(key, {
            value,
            expiresAt: this.now() + this.ttlMs,
          });
          while (this.entries.size > this.maxKeys) {
            const oldest = this.entries.keys().next().value as string;
            this.entries.delete(oldest);
          }
        }
        return value;
      } finally {
        if (this.inflight.get(key) === self.p) this.inflight.delete(key);
      }
    })();
    self.p = promise;
    this.inflight.set(key, promise);
    return promise;
  }
}
