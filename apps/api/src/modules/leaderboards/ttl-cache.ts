/// Процессный кэш рейтингов: TTL + объединение одинаковых параллельных
/// запросов (single-flight) + сброс. Поколение не даёт записать результат
/// загрузки, начатой до `clear()` (устаревшие данные после смены приватности).
interface Entry<T> {
  value: T;
  expiresAt: number;
}

export class TtlCache<T> {
  private entry: Entry<T> | null = null;
  private inflight: Promise<T> | null = null;
  private generation = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = () => Date.now(),
  ) {}

  clear(): void {
    this.generation += 1;
    this.entry = null;
    this.inflight = null;
  }

  async getOrLoad(loader: () => Promise<T>): Promise<T> {
    if (this.entry && this.entry.expiresAt > this.now())
      return this.entry.value;
    if (this.inflight) return this.inflight;
    const generation = this.generation;
    const self: { p?: Promise<T> } = {};
    const promise: Promise<T> = (async () => {
      try {
        const value = await loader();
        if (generation === this.generation) {
          this.entry = { value, expiresAt: this.now() + this.ttlMs };
        }
        return value;
      } finally {
        if (this.inflight === self.p) this.inflight = null;
      }
    })();
    self.p = promise;
    this.inflight = promise;
    return promise;
  }
}
