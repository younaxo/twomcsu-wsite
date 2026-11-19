package ru.twomc.giveaway;

/** Корзина минуты по реальным часам: heartbeat не теряется и не дублируется при лагах тиков сервера. */
public final class MinuteBucket {
    private long last = Long.MIN_VALUE;

    /** @return true, если наступила новая минута (по часам) с прошлого вызова, возвращавшего true. */
    public boolean advance(long nowMillis) {
        long bucket = Math.floorDiv(nowMillis, 60_000L);
        if (bucket == last) return false;
        last = bucket;
        return true;
    }
}
