import { TtlCache } from './ttl-cache';

describe('TtlCache', () => {
  it('держит значение до конца TTL, потом загружает заново', async () => {
    let now = 0;
    const cache = new TtlCache<number>(1000, () => now);
    const loader = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    expect(await cache.getOrLoad(loader)).toBe(1);
    now = 999;
    expect(await cache.getOrLoad(loader)).toBe(1);
    now = 1000;
    expect(await cache.getOrLoad(loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('параллельные запросы делят одну загрузку (single-flight)', async () => {
    const cache = new TtlCache<number>(1000);
    let release: (value: number) => void = () => undefined;
    const loader = jest.fn(
      () => new Promise<number>((resolve) => (release = resolve)),
    );
    const a = cache.getOrLoad(loader);
    const b = cache.getOrLoad(loader);
    release(7);
    expect(await Promise.all([a, b])).toEqual([7, 7]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('clear() сбрасывает значение сразу', async () => {
    const cache = new TtlCache<number>(60_000);
    const loader = jest.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    await cache.getOrLoad(loader);
    cache.clear();
    expect(await cache.getOrLoad(loader)).toBe(2);
  });

  it('загрузка, начатая до clear(), не записывается в кэш', async () => {
    const cache = new TtlCache<string>(60_000);
    let release: (value: string) => void = () => undefined;
    const slow = cache.getOrLoad(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    cache.clear();
    release('stale');
    expect(await slow).toBe('stale');
    expect(await cache.getOrLoad(() => Promise.resolve('fresh'))).toBe('fresh');
  });

  it('ошибка загрузки не кэшируется', async () => {
    const cache = new TtlCache<number>(1000);
    await expect(
      cache.getOrLoad(() => Promise.reject(new Error('db'))),
    ).rejects.toThrow('db');
    expect(await cache.getOrLoad(() => Promise.resolve(5))).toBe(5);
  });
});
