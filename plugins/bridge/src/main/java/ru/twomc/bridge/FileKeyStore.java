package ru.twomc.bridge;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.channels.OverlappingFileLockException;
import java.nio.charset.StandardCharsets;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;
import java.util.logging.Logger;
import java.util.zip.CRC32;

/**
 * Журнал исходов выдачи: append-only файл {@code executed-keys.log} в папке плагина.
 *
 * <p>Строка: {@code <тип>|<секунды эпохи>|<ключ>|<crc32 hex из "тип|секунды|ключ">}. Типы: S начало, D выполнено,
 * F отвергнуто, U исход неизвестен, X «забыть» (оператор). Каждая запись это одна строка, дописанная одним
 * write и сразу {@code force(true)} (fsync): строка либо целиком на диске с верной CRC, либо отбрасывается при
 * чтении (оборванный хвост, порча). Последняя запись по ключу побеждает, но DONE перекрывается только записью X
 * (метод {@link #forget} DONE не снимает, DONE снимается лишь ручным редактированием файла).
 *
 * <p>Порядок для команды: {@code begin} (S, fsync) -> команда -> {@code finish} (D, fsync). Падение сервера между
 * S и D оставляет STARTED: после рестарта ключ считается неизвестным и повторно НЕ выполняется (не более одного
 * исполнения). Полная атомарность «команда выполнена и записана» невозможна без транзакций самой игры; модель
 * выбирает «лучше не выдать, чем выдать дважды», а разбор неизвестного отдан администратору.
 *
 * <p>При открытии: эксклюзивная блокировка {@code executed-keys.lock} (второй сервер на той же папке не
 * запустится; отдельное исключение {@link JournalBusyException}), чтение, отсечение записей старше срока хранения.
 * Оборванный последний кусок без {@code \n} (типичное падение посреди записи) это норма: он отбрасывается, файл
 * атомарно переписывается (tmp + fsync + ATOMIC_MOVE + fsync каталога). ПОРЧА (строка с неверной CRC или форматом
 * не в хвосте) это fail closed: копия сохраняется как {@code executed-keys.log.bad-<секунды>}, {@link #healthy()}
 * равен false, выдача выключена, файл не трогается до явного подтверждения оператора
 * ({@link #acknowledgeCorruption()}, команда {@code /twomcbridge ackcorrupt}); затем файл переписывается без
 * повреждённых строк.
 */
final class FileKeyStore implements KeyStore {
    static final String LOG_NAME = "executed-keys.log";
    static final String LOCK_NAME = "executed-keys.lock";

    private record Entry(State state, long ts) {}

    private final Path dir;
    private final Path log;
    private final LongSupplier clock;
    private final Logger logger;
    private final Map<String, Entry> map = new HashMap<>();
    private FileChannel lockChannel;
    private FileLock lock;
    private FileChannel out;
    private boolean healthy = true;
    /** При чтении найдена порча (не оборванный хвост): выдача выключена до {@link #acknowledgeCorruption()}. */
    private boolean corruptPending;
    /** Копия повреждённого журнала, сохранённая при обнаружении порчи (для двухшагового ackcorrupt). */
    private Path badCopy;
    private boolean dirSyncWarned;

    private FileKeyStore(Path dir, LongSupplier clock, Logger logger) {
        this.dir = dir;
        this.log = dir.resolve(LOG_NAME);
        this.clock = clock;
        this.logger = logger;
    }

    static FileKeyStore open(Path dir, LongSupplier clockMillis, long retentionMs, Logger logger) throws IOException {
        Files.createDirectories(dir);
        FileKeyStore s = new FileKeyStore(dir, clockMillis, logger);
        try {
            s.acquireLock();
            s.load(retentionMs);
            boolean created = !Files.exists(s.log);
            s.out = FileChannel.open(s.log, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.APPEND);
            if (created) {
                s.fsyncDir(); // запись о новом файле в каталоге тоже должна пережить падение питания
            }
        } catch (IOException | RuntimeException e) {
            s.close();
            throw e;
        }
        return s;
    }

    private void acquireLock() throws IOException {
        lockChannel = FileChannel.open(dir.resolve(LOCK_NAME), StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        try {
            lock = lockChannel.tryLock();
        } catch (OverlappingFileLockException e) {
            lock = null;
        }
        if (lock == null) {
            throw new JournalBusyException();
        }
    }

    /**
     * fsync каталога после создания файла и после rename: без него запись каталога может не пережить падение
     * питания. Best-effort: на Windows каталог открыть для force нельзя, это не ошибка (один раз в лог).
     */
    private void fsyncDir() {
        try (FileChannel ch = FileChannel.open(dir, StandardOpenOption.READ)) {
            ch.force(true);
        } catch (IOException | RuntimeException e) {
            if (!dirSyncWarned) {
                dirSyncWarned = true;
                logger.warning("Журнал ключей: fsync каталога недоступен (" + e.getClass().getSimpleName()
                        + "); долговечность переименования файла зависит от файловой системы.");
            }
        }
    }

    // ---- чтение и сжатие ----

    private static String crcOf(String payload) {
        CRC32 c = new CRC32();
        c.update(payload.getBytes(StandardCharsets.UTF_8));
        return String.format("%08x", c.getValue());
    }

    private static String line(char type, long seconds, String key) {
        String payload = type + "|" + seconds + "|" + key;
        return payload + "|" + crcOf(payload) + "\n";
    }

    private void load(long retentionMs) throws IOException {
        if (!Files.exists(log)) {
            return;
        }
        byte[] raw = Files.readAllBytes(log);
        String text = new String(raw, StandardCharsets.UTF_8);
        boolean tornTail = raw.length > 0 && raw[raw.length - 1] != '\n';
        List<String> lines = new ArrayList<>(List.of(text.split("\n", -1)));
        if (!lines.isEmpty() && lines.get(lines.size() - 1).isEmpty()) {
            lines.remove(lines.size() - 1); // пустой остаток после последнего \n
        }
        int corrupt = 0;
        int total = 0;
        for (int i = 0; i < lines.size(); i++) {
            String l = lines.get(i);
            if (l.isEmpty()) {
                continue;
            }
            total++;
            boolean isTornTail = tornTail && i == lines.size() - 1;
            if (!apply(l) && !isTornTail) {
                corrupt++;
            }
        }
        long cutoffSec = (clock.getAsLong() - retentionMs) / 1000;
        int before = map.size();
        map.values().removeIf(e -> e.state == State.FAILED || e.ts < cutoffSec);
        boolean dropped = map.size() != before;
        if (corrupt > 0) {
            // Fail closed (M3): потеря записи DONE означала бы повторную выдачу. Журнал НЕ переписывается, выдача выключена,
            // пока оператор не проверит копию и не подтвердит командой /twomcbridge ackcorrupt.
            Path bad = dir.resolve(LOG_NAME + ".bad-" + (clock.getAsLong() / 1000));
            Files.copy(log, bad, StandardCopyOption.REPLACE_EXISTING);
            badCopy = bad;
            pruneBadCopies();
            corruptPending = true;
            healthy = false;
            logger.severe("Журнал ключей: повреждённых строк " + corrupt + "; копия сохранена в " + bad.getFileName()
                    + ". ВЫДАЧА ВЫКЛЮЧЕНА: проверьте возможную потерю записей о выполненной выдаче и подтвердите командой "
                    + "/twomcbridge ackcorrupt (журнал при этом будет переписан без повреждённых строк).");
            return;
        }
        if (tornTail) {
            logger.warning("Журнал ключей: оборван последний кусок записи (падение сервера); он отброшен.");
        }
        if (tornTail || dropped || total > map.size() + 100) {
            compact();
        }
    }

    /** Сколько копий executed-keys.log.bad-* хранить (последние по времени в имени); старше удаляются. */
    static final int MAX_BAD_COPIES = 5;

    private void pruneBadCopies() {
        String prefix = LOG_NAME + ".bad-";
        try (java.util.stream.Stream<Path> files = Files.list(dir)) {
            List<Path> bad = new ArrayList<>(files
                    .filter(p -> p.getFileName().toString().startsWith(prefix))
                    .toList());
            // секунды в имени: сравниваем как числа, нечисловой суффикс считаем самым старым
            bad.sort((a, b) -> Long.compare(badStamp(b, prefix), badStamp(a, prefix)));
            for (int i = MAX_BAD_COPIES; i < bad.size(); i++) {
                if (bad.get(i).equals(badCopy)) {
                    continue;
                }
                Files.deleteIfExists(bad.get(i));
            }
        } catch (IOException | RuntimeException e) {
            logger.warning("Журнал ключей: не удалось почистить старые копии .bad (" + e.getClass().getSimpleName() + ").");
        }
    }

    private static long badStamp(Path p, String prefix) {
        try {
            return Long.parseLong(p.getFileName().toString().substring(prefix.length()));
        } catch (NumberFormatException e) {
            return Long.MIN_VALUE;
        }
    }

    @Override
    public synchronized String corruptionCopyName() {
        return corruptPending && badCopy != null ? badCopy.toString() : null;
    }

    private boolean apply(String l) {
        String[] p = l.split("\\|", -1);
        if (p.length != 4 || p[0].length() != 1) {
            return false;
        }
        if (!crcOf(p[0] + "|" + p[1] + "|" + p[2]).equals(p[3])) {
            return false;
        }
        long ts;
        try {
            ts = Long.parseLong(p[1]);
        } catch (NumberFormatException e) {
            return false;
        }
        String key = p[2];
        if (!Protocol.IDEMPOTENCY_KEY.matcher(key).matches()) {
            return false;
        }
        Entry cur = map.get(key);
        boolean curDone = cur != null && cur.state == State.DONE;
        switch (p[0].charAt(0)) {
            case 'S' -> {
                if (!curDone) map.put(key, new Entry(State.STARTED, ts));
            }
            case 'D' -> map.put(key, new Entry(State.DONE, ts));
            case 'F' -> {
                if (!curDone) map.put(key, new Entry(State.FAILED, ts));
            }
            case 'U' -> {
                if (!curDone) map.put(key, new Entry(State.UNKNOWN, ts));
            }
            case 'X' -> map.remove(key);
            default -> {
                return false;
            }
        }
        return true;
    }

    private void compact() throws IOException {
        Path tmp = dir.resolve(LOG_NAME + ".tmp");
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, Entry> e : map.entrySet()) {
            char t = switch (e.getValue().state) {
                case DONE -> 'D';
                case UNKNOWN -> 'U';
                default -> 'S';
            };
            sb.append(line(t, e.getValue().ts, e.getKey()));
        }
        try (FileChannel ch = FileChannel.open(tmp, StandardOpenOption.CREATE, StandardOpenOption.WRITE,
                StandardOpenOption.TRUNCATE_EXISTING)) {
            ByteBuffer buf = ByteBuffer.wrap(sb.toString().getBytes(StandardCharsets.UTF_8));
            while (buf.hasRemaining()) {
                ch.write(buf);
            }
            ch.force(true);
        }
        try {
            Files.move(tmp, log, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
        } catch (AtomicMoveNotSupportedException e) {
            Files.move(tmp, log, StandardCopyOption.REPLACE_EXISTING);
        }
        fsyncDir();
    }

    // ---- запись ----

    private boolean append(char type, String key) {
        if (!healthy) {
            return false; // журнал недоступен или ждёт ackcorrupt: на диск ничего не пишем (L6)
        }
        if (out == null) {
            healthy = false;
            return false;
        }
        try {
            ByteBuffer buf = ByteBuffer.wrap(line(type, clock.getAsLong() / 1000, key).getBytes(StandardCharsets.UTF_8));
            while (buf.hasRemaining()) {
                out.write(buf);
            }
            out.force(true);
            return true;
        } catch (IOException e) {
            healthy = false;
            logger.severe("Журнал ключей: запись не удалась (" + e.getClass().getSimpleName() + "); выдача приостановлена.");
            return false;
        }
    }

    @Override
    public synchronized State state(String key) {
        Entry e = map.get(key);
        return e == null ? State.NONE : e.state;
    }

    @Override
    public synchronized boolean begin(String key) {
        if (!healthy || !Protocol.IDEMPOTENCY_KEY.matcher(key).matches()) {
            return false;
        }
        if (!append('S', key)) {
            return false;
        }
        map.put(key, new Entry(State.STARTED, clock.getAsLong() / 1000));
        return true;
    }

    @Override
    public synchronized boolean finish(String key, State outcome) {
        char t = switch (outcome) {
            case DONE -> 'D';
            case FAILED -> 'F';
            case UNKNOWN -> 'U';
            default -> throw new IllegalArgumentException("outcome");
        };
        map.put(key, new Entry(outcome, clock.getAsLong() / 1000)); // память обновляется всегда
        return append(t, key);
    }

    @Override
    public synchronized boolean forget(String key) {
        Entry e = map.get(key);
        if (e == null || e.state == State.DONE) {
            return false;
        }
        if (!append('X', key)) {
            return false;
        }
        map.remove(key);
        return true;
    }

    @Override
    public synchronized boolean corruptionPending() {
        return corruptPending;
    }

    /**
     * Оператор проверил копию {@code executed-keys.log.bad-*} и принимает риск потери записей. Журнал переписывается без
     * повреждённых строк (tmp + fsync + ATOMIC_MOVE + fsync каталога), после чего выдача разрешается. false: подтверждать
     * нечего либо перезапись не удалась (журнал остаётся недоступным).
     */
    @Override
    public synchronized boolean acknowledgeCorruption() {
        if (!corruptPending) {
            return false;
        }
        try {
            if (out != null) {
                out.close(); // перед rename закрываем дескриптор старого файла (на Windows иначе замена невозможна)
                out = null;
            }
            compact();
            out = FileChannel.open(log, StandardOpenOption.CREATE, StandardOpenOption.WRITE, StandardOpenOption.APPEND);
        } catch (IOException | RuntimeException e) {
            logger.severe("Журнал ключей: подтверждение порчи не удалось (" + e.getClass().getSimpleName() + "); выдача остаётся выключенной.");
            return false;
        }
        corruptPending = false;
        healthy = true;
        logger.warning("Журнал ключей: оператор подтвердил порчу; файл переписан без повреждённых строк, выдача разрешена.");
        return true;
    }

    @Override
    public synchronized boolean healthy() {
        return healthy;
    }

    @Override
    public synchronized int size() {
        return map.size();
    }

    @Override
    public synchronized void close() {
        healthy = false;
        try {
            if (out != null) out.close();
        } catch (IOException ignored) {
            // закрытие best-effort
        }
        try {
            if (lock != null) lock.release();
            if (lockChannel != null) lockChannel.close();
        } catch (IOException ignored) {
            // закрытие best-effort
        }
        out = null;
    }
}
