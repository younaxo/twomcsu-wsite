import {
  PUBLIC_CACHE_MAX_KEYS,
  PUBLIC_CACHE_TTL_MS,
  PublicPunishmentsCache,
} from './punishments-public-cache';

/// Тест-план п.17, 18: TTL, LRU на 100 ключей, single-flight, сброс.
describe('PublicPunishmentsCache', () => {
  let now = 0;
  const clock = () => now;
  beforeEach(() => {
    now = 1000;
  });

  it('второй запрос в пределах TTL берётся из кэша', async () => {
    const cache = new PublicPunishmentsCache<string>(clock);
    const loader = jest.fn().mockResolvedValue('v1');
    expect(await cache.getOrLoad('k', loader)).toBe('v1');
    expect(await cache.getOrLoad('k', loader)).toBe('v1');
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('после TTL загружается заново', async () => {
    const cache = new PublicPunishmentsCache<string>(clock);
    const loader = jest
      .fn()
      .mockResolvedValueOnce('a')
      .mockResolvedValueOnce('b');
    await cache.getOrLoad('k', loader);
    now += PUBLIC_CACHE_TTL_MS + 1;
    expect(await cache.getOrLoad('k', loader)).toBe('b');
  });

  it('параллельные одинаковые запросы объединяются (single-flight)', async () => {
    const cache = new PublicPunishmentsCache<string>(clock);
    let resolve!: (v: string) => void;
    const loader = jest.fn(() => new Promise<string>((r) => (resolve = r)));
    const p1 = cache.getOrLoad('k', loader);
    const p2 = cache.getOrLoad('k', loader);
    resolve('x');
    expect(await Promise.all([p1, p2])).toEqual(['x', 'x']);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('ошибка загрузки не кэшируется и не залипает', async () => {
    const cache = new PublicPunishmentsCache<string>(clock);
    const loader = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');
    await expect(cache.getOrLoad('k', loader)).rejects.toThrow('boom');
    expect(cache.size).toBe(0);
    expect(await cache.getOrLoad('k', loader)).toBe('ok');
  });

  it('вытесняет самый давний ключ при более чем 100 ключах', async () => {
    const cache = new PublicPunishmentsCache<number>(clock);
    for (let i = 0; i < PUBLIC_CACHE_MAX_KEYS + 5; i += 1) {
      await cache.getOrLoad(`cursor-${i}`, async () => i);
    }
    expect(cache.size).toBe(PUBLIC_CACHE_MAX_KEYS);
    const loader = jest.fn().mockResolvedValue(-1);
    expect(await cache.getOrLoad('cursor-0', loader)).toBe(-1);
    const last = jest.fn().mockResolvedValue(-2);
    expect(
      await cache.getOrLoad(`cursor-${PUBLIC_CACHE_MAX_KEYS + 4}`, last),
    ).toBe(PUBLIC_CACHE_MAX_KEYS + 4);
  });

  it('обращение к ключу делает его «свежим» (LRU)', async () => {
    const cache = new PublicPunishmentsCache<number>(clock, 2);
    await cache.getOrLoad('a', async () => 1);
    await cache.getOrLoad('b', async () => 2);
    await cache.getOrLoad('a', async () => 99);
    await cache.getOrLoad('c', async () => 3);
    const loaderA = jest.fn().mockResolvedValue(10);
    expect(await cache.getOrLoad('a', loaderA)).toBe(1);
    expect(loaderA).not.toHaveBeenCalled();
    const loaderB = jest.fn().mockResolvedValue(20);
    expect(await cache.getOrLoad('b', loaderB)).toBe(20);
  });

  it('clear() сбрасывает записи; результат загрузки во время сброса не пишется', async () => {
    const cache = new PublicPunishmentsCache<string>(clock);
    await cache.getOrLoad('k', async () => 'old');
    cache.clear();
    expect(cache.size).toBe(0);

    let resolve!: (v: string) => void;
    const slow = cache.getOrLoad(
      'k2',
      () => new Promise<string>((r) => (resolve = r)),
    );
    cache.clear();
    resolve('stale');
    expect(await slow).toBe('stale');
    expect(cache.size).toBe(0);
    expect(await cache.getOrLoad('k2', async () => 'fresh')).toBe('fresh');
  });
});
