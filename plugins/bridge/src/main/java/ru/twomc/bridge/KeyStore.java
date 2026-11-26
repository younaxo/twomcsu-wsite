package ru.twomc.bridge;

/**
 * Персистентное хранилище исходов по idempotencyKey (R167). Все методы потокобезопасны.
 *
 * <p>Состояния: NONE (ключ не известен); STARTED (запись «начало» сделана до команды, исход не записан:
 * команда могла выполниться или нет); DONE (команда выполнена); FAILED (команда отвергнута, побочного
 * эффекта нет; ключ можно выполнить снова); UNKNOWN (исход неизвестен, повторное выполнение запрещено).
 */
interface KeyStore {
    enum State { NONE, STARTED, DONE, FAILED, UNKNOWN }

    State state(String key);

    /** Записать «начало» (durable) ДО выполнения команды. false: запись не удалась, команду выполнять нельзя. */
    boolean begin(String key);

    /** Записать исход (DONE, FAILED или UNKNOWN). Память обновляется всегда; false: на диск не записалось. */
    boolean finish(String key, State outcome);

    /** Оператор снимает STARTED/UNKNOWN после ручной проверки. DONE снять нельзя. */
    boolean forget(String key);

    /** true: при открытии найдена порча журнала, выдача выключена до {@link #acknowledgeCorruption()} (fail closed). */
    default boolean corruptionPending() {
        return false;
    }

    /** Путь к сохранённой копии повреждённого журнала (показывается оператору до подтверждения) или null. */
    default String corruptionCopyName() {
        return null;
    }

    /** Оператор подтверждает порчу после ручной проверки копии; журнал переписывается, выдача разрешается. */
    default boolean acknowledgeCorruption() {
        return false;
    }

    boolean healthy();

    int size();

    void close();
}
