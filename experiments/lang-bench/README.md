# lang-bench: расчёт корзины на TS / TS с батчем / Rust / Java 21

Эксперимент B1 из `docs/architecture/POLYGLOT-ANALYSIS.md` (промпт 19, задача 2; промпт 22). Основной код (`apps/**`) не менялся и не импортируется. Не внедрять в основной сайт без команды владельца.

## Структура

```
CONTRACT.md                  HTTP-контракт POST /store/cart/calculate (+ GET /health), правила, канонический вид денег
fixtures/dataset.json        правила скидок, тиры лояльности, промокоды (синтетика, без ПДн)
fixtures/golden.json         48 golden-кейсов, ожидания посчитаны ВРУЧНУЮ (tools/build-golden.mjs)
tools/build-golden.mjs       собирает golden.json из спецификации с литеральными ожиданиями
tools/gen-carts.mjs          детерминированный генератор корзин (seed, N >= 1000), профили нагрузки, большой набор правил
tools/check-equivalence.mjs  эквивалентность: golden на каждой реализации + сравнение всех на сгенерированных корзинах
tools/summarize.mjs          медианы по повторам из вывода oha и docker stats
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
