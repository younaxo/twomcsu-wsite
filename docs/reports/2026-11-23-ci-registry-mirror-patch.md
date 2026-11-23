# Патч CI: образы Postgres и Redis без лимита «Data limit exceeded» (23.11.2026)

Статус: готов к применению владельцем через веб-редактор GitHub. Агент `.github/workflows` не меняет.

## Что происходит

Задание `Lint, typecheck, test, build` (`.github/workflows/ci.yml`) поднимает service-контейнеры:

```yaml
        image: public.ecr.aws/docker/library/postgres:16-alpine   # строка 22
        image: public.ecr.aws/docker/library/redis:7-alpine       # строка 35
```

Ошибка `Error response from daemon: error from registry: Data limit exceeded` приходит
от **ECR Public** (anonymous pull quota на общих IP раннеров GitHub). Docker Hub здесь не используется:
переход на ECR Public сделан коммитом 4775b59c (10.10.2026). Ночью 22–23.11 так падали
PR #220 и #223 (runs 45102295235, 45102966472), до тестов дело не доходило.

## Патч (вариант А, рекомендуемый): зеркало Google `mirror.gcr.io`

Файл: `.github/workflows/ci.yml`, задание `quality`, блок `services`. Заменить ровно две строки.

```diff
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -19,7 +19,7 @@ jobs:
     runs-on: ubuntu-latest
     services:
       postgres:
-        image: public.ecr.aws/docker/library/postgres:16-alpine
+        image: mirror.gcr.io/library/postgres:16-alpine
         env:
           POSTGRES_USER: twomc
           POSTGRES_PASSWORD: ci_password
@@ -32,7 +32,7 @@ jobs:
           --health-timeout 5s
           --health-retries 10
       redis:
-        image: public.ecr.aws/docker/library/redis:7-alpine
+        image: mirror.gcr.io/library/redis:7-alpine
         ports:
           - 6379:6379
         options: >-
```

Итоговые строки после правки:

```yaml
        image: mirror.gcr.io/library/postgres:16-alpine
```

```yaml
        image: mirror.gcr.io/library/redis:7-alpine
```

Образы те же (официальные Docker Library), меняется только реестр. Секреты не нужны, остальной файл не меняется.

## Вариант Б (если зеркало Google не отдаст тег)

Вернуть короткие имена Docker Hub. На GitHub-hosted раннерах Docker Hub для анонимных pull обычно не упирается в лимит:

```yaml
        image: postgres:16-alpine
```

```yaml
        image: redis:7-alpine
```

## Как применить (веб-редактор GitHub)

1. Открыть `https://github.com/younaxo/twomcsu-wsite/edit/main/.github/workflows/ci.yml`.
   Прямой push в `main` запрещён ruleset'ом, поэтому выбрать **Create a new branch for this commit and start a pull request**.
2. Заменить строки 22 и 35, как в варианте А.
3. Создать PR и дождаться трёх обязательных проверок (`Lint, typecheck, test, build`, CodeQL, gitleaks), затем слить.
4. Остальные открытые PR подтянут правку после `Update branch`. Это агент делает сам.

## Проверка после применения

В логе шага `Initialize containers` должны быть `mirror.gcr.io/library/postgres:16-alpine` и `... Status: Downloaded`, без `Data limit exceeded`.

## Откат

Вернуть две строки к `public.ecr.aws/docker/library/...`.
