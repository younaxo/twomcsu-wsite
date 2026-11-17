import { PUBLIC_CACHE_CONTROL } from './punishments-http';
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

/// Тест-план п.17 (L2): без инвалидации запись видна не дольше
/// TTL серверного кэша + max-age + stale-while-revalidate = 5 + 15 + 30 с.
describe('предел задержки скрытия (п.17, контракт 6.2)', () => {
  function seconds(directive: string): number {
    const match = new RegExp(`${directive}=([0-9]+)`).exec(
      PUBLIC_CACHE_CONTROL,
    );
    if (!match) throw new Error(`нет директивы ${directive}`);
    return Number(match[1]);
  }

  it('директивы Cache-Control: max-age 15 и stale-while-revalidate 30, без s-maxage', () => {
    expect(seconds('max-age')).toBe(15);
    expect(seconds('stale-while-revalidate')).toBe(30);
    expect(PUBLIC_CACHE_CONTROL).not.toContain('s-maxage');
  });

  it('TTL серверного кэша 5 с; сумма 5 + 15 + 30 = 50 с', () => {
    expect(PUBLIC_CACHE_TTL_MS).toBe(5000);
    const totalMs =
      PUBLIC_CACHE_TTL_MS +
      (seconds('max-age') + seconds('stale-while-revalidate')) * 1000;
    expect(totalMs).toBe(50_000);
  });

  it('без инвалидации серверный кэш отдаёт старое значение строго до TTL и не дольше', async () => {
    let now = 0;
    const cache = new PublicPunishmentsCache<string>(() => now);
    let value = 'старое';
    const load = () => cache.getOrLoad('k', async () => value);
    expect(await load()).toBe('старое');
    value = 'новое';
    now = PUBLIC_CACHE_TTL_MS - 1;
    expect(await load()).toBe('старое');
    now = PUBLIC_CACHE_TTL_MS;
    expect(await load()).toBe('новое');
  });
});
