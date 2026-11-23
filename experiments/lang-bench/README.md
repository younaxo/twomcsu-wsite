# lang-bench: расчёт корзины на TS / TS с батчем / Rust / Java 21

Эксперимент B1 из `docs/architecture/POLYGLOT-ANALYSIS.md` (промпт 19, задача 2; промпт 22). Основной код (`apps/**`) не менялся и не импортируется. Не внедрять в основной сайт без команды владельца.

## Структура

```
CONTRACT.md                  HTTP-контракт POST /store/cart/calculate (+ GET /health), правила, канонический вид денег
fixtures/dataset.json        правила скидок, тиры лояльности, промокоды (синтетика, без ПДн)
fixtures/golden.json         58 golden-кейсов (в т.ч. с сырым телом rawBody), ожидания посчитаны ВРУЧНУЮ (tools/build-golden.mjs)
tools/build-golden.mjs       собирает golden.json из спецификации с литеральными ожиданиями
tools/gen-carts.mjs          детерминированный генератор корзин (seed, N >= 1000), профили нагрузки, большой набор правил
tools/check-equivalence.mjs  эквивалентность: golden на каждой реализации + сравнение всех на сгенерированных корзинах
tools/summarize.mjs          медианы по повторам, сравнение с ts-current и ts-batch, нагрузчик, ошибки
impl/ts-current/             (a) текущая логика, N+1 (await на каждую позицию), Node 24, без зависимостей
impl/ts-batch/               (b) контроль: одна выборка скидок на корзину
impl/rust/                   (c) axum + tokio + rust_decimal            (не собиралась локально)
impl/java/                   (d) Java 21, виртуальные потоки, BigDecimal (не собиралась локально)
bench/run-bench.sh           сценарий бенчмарка (только VDS, не запускался)
```

Каждая реализация имеет `Dockerfile`; контекст сборки — этот каталог: `docker build -f impl/<имя>/Dockerfile -t langbench-<имя> .`

## Что можно запускать локально (только Node 22.18+/24, без установки зависимостей)

```bash
node tools/gen-carts.mjs --count 2000                  # generated/carts.json, bench-*.json (каталог в .gitignore)
node tools/build-golden.mjs                            # пересобрать golden.json
node tools/check-equivalence.mjs --inproc ts-current,ts-batch
# серверы TS: PORT=18081 node impl/ts-current/server.ts ; затем --http ts-current=http://127.0.0.1:18081,...
```

Rust и Java локально не собираются (запрещено правилами); их эквивалентность проверяется на VDS: `check-equivalence.mjs --http ...` (запускает `bench/run-bench.sh` первым этапом).

## Допущения реализации

- «Текущий TS» — не NestJS, а минимальный `node:http`-сервис с копией формул `pricing.service.ts` на точной арифметике BigInt (вместо `Prisma.Decimal`). Накладные расходы Nest/Prisma/DI в замер не входят; сравнение — чистой логики и формы вызовов (N+1 против батча).
- Источник данных — память; задержка обращений к БД моделируется `DB_LATENCY_MS` (см. CONTRACT.md). Реальную БД с одинаковым пулом и объёмом данных ставит отдельный сквозной этап.
- Сравнение с боевым кодом на Prisma.Decimal в самом эксперименте не выполняется (нет зависимостей); область определения контракта выбрана так, чтобы точная арифметика совпадала с decimal.js (см. CONTRACT.md).

## Воспроизводимость (M2)

- Образы в Dockerfile закреплены ТЕГАМИ версий (`node:24.18.0-alpine`, `rust:1.90-slim-bookworm`, `debian:bookworm-slim`, `maven:3.9.9-eclipse-temurin-21`, `eclipse-temurin:21.0.5_11-jre-alpine`), digest НЕ закреплены: без Docker и сети их получить нельзя, выдумывать нельзя. Каждый Dockerfile принимает образ через `ARG` (`NODE_IMAGE`, `RUST_IMAGE`, `RUNTIME_IMAGE`, `MAVEN_IMAGE`, `JRE_IMAGE`).
- Шаг на VDS перед первым боевым прогревом: для каждого образа `docker buildx imagetools inspect <тег>` -> взять `Digest: sha256:...` -> передать `DOCKER_BUILD_ARGS="--build-arg NODE_IMAGE=node:24.18.0-alpine@sha256:<digest> --build-arg RUST_IMAGE=... --build-arg RUNTIME_IMAGE=... --build-arg MAVEN_IMAGE=... --build-arg JRE_IMAGE=..."` в `bench/run-bench.sh` и записать digest в отчёт. Если какого-то тега нет в реестре (теги выбраны без доступа к сети, в первую очередь `rust:1.90-slim-bookworm`), взять ближайший существующий и отметить это в отчёте.
- `.dockerignore` (в этом каталоге, он же контекст сборки) исключает `generated/`, `results/`, `target/`, `node_modules/`, логи и `.git`.
- Maven: версии плагинов жизненного цикла закреплены в `impl/java/pom.xml` (значения по умолчанию Maven 3.9.9); зависимость jackson-databind закреплена `2.17.2`.
- Cargo.lock отсутствует (Rust не собирался). После ПЕРВОЙ успешной сборки на VDS: достать `Cargo.lock` (например, `docker run --rm --entrypoint cat <builder-слой>` или `docker build --target build` + `docker cp`), положить в `impl/rust/Cargo.lock`, закоммитить; дальше собирать с `DOCKER_BUILD_ARGS="--build-arg CARGO_FLAGS=--locked"`. Dockerfile копирует `impl/rust/Cargo.*`, то есть подхватит lock автоматически.

## Оговорки к результатам (M3, M4, M5, M6)

Эти оговорки обязаны попасть в отчёт `docs/reports/lang-bench-report.md`.

- Node однопоточный (M3). Контейнер ограничен двумя ядрами (`--cpus 2`), но один процесс Node использует в основном одно: предел ts-вариантов около 100 % CPU, второе ядро почти простаивает. Это честное поведение «текущего сервиса» (боевой Nest тоже один процесс), но Rust (tokio multi-thread) и Java используют оба ядра, поэтому часть прироста на высоких уровнях параллелизма даёт многопоточность, а не язык как таковой. Вариант Node с несколькими процессами (cluster, 2 воркера) в эксперимент не входит; при необходимости — отдельным вариантом.
- Java (M4). Сборщик мусора задан явно (`-XX:+UseG1GC`, одинаково везде, где запускается Java: Dockerfile по умолчанию и `JAVA_OPTS` в `run-bench.sh`; значение пишется в `meta.json`: `java_gc`, `java_opts`). Без флага на 2 vCPU / 512 МиБ JVM выбрала бы SerialGC. Сервер Java — `com.sun.net.httpserver` (JDK HttpServer с виртуальными потоками): он заметно медленнее серьёзных серверов (Netty, Undertow, Helidon Nima, Vert.x), поэтому показатели Java ЗАНИЖЕНЫ относительно того, что дал бы боевой выбор; вывод «Java не даёт прироста» по этому прототипу недостаточен без прогона на производственном HTTP-стеке.
- Rust (M6). Образ собирается под glibc (gnu), чтобы не получить медленный аллокатор musl; при желании выигрыш можно усилить `mimalloc`/`jemalloc` (в эксперимент не входит — без сборки не проверить). Размер образа Rust поэтому больше, чем у musl+scratch.
- Нагрузчик oha (M5). Нагрузчик ограничен ядрами `LOADGEN_CPUS` и сам потребляет CPU и память; они снимаются `docker stats` (`*.loadgen.csv`) и попадают в `summary.md`. Если средний CPU нагрузчика >= 80 % его ядер, строка помечается «насыщение нагрузчика»: результат ограничен нагрузчиком, а не сервером (типично для Rust при 500 соединений). Такие строки нельзя использовать для выводов без разбора.
- Ошибки. `summarize.mjs` выводит `errorDistribution` oha (ошибки соединения, таймауты), долю ответов не 200 и блок «ВНИМАНИЕ» при любых ошибках; цифры RPS/p95 при ошибках недостоверны.
- Порядок прогонов (L2). Повторы идут по кругу: для каждого повтора поочерёдно все варианты (порядок сдвигается на единицу), чтобы дрейф стенда не ложился на один вариант. Холодный старт и прогрев повторяются перед каждым замером варианта.

## Правило сравнения (единое, B1)

Каждый вариант сравнивается И с (a) `ts-current`, И с (b) `ts-batch`; прирост p95 = база / вариант - 1, прирост RPS = вариант / база - 1. Классы по приросту p95: менее 30 % / от 30 % до 2x (серая зона) / 2x и более. Решение принимается по сравнению с (b); сравнение с (a) справочное. Реализация — `tools/summarize.mjs`, формулировка в `docs/reports/lang-bench-plan.md` и `docs/architecture/POLYGLOT-ANALYSIS.md`.

## Эквивалентность (H1)

`bench/run-bench.sh` гоняет golden только на `fixtures/dataset.json` (ожидания посчитаны вручную для него). Для большого набора (`DATASET_FILE`) выполняется отдельный шаг `check-equivalence.mjs --no-golden --dataset <файл>`: варианты сравниваются между собой на сгенерированных корзинах (включая сырые валидационные `raw-*`).
