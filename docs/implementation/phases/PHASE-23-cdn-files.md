# PHASE 23 — CDN / файловое хранилище

Ветка `feature/cdn-files`. Реализация схемы B из `docs/technical/26-CDN-FILES.md`
(ADR-0008): модель `File` уже была в схеме (PHASE 04), код хранилища и
загрузок появился здесь.

## Реализовано (`apps/api/src/modules/files`)

- `StorageService` — драйверы `local` (диск `UPLOADS_DIR`, раздаётся самим
  API по `/uploads` с `immutable`-кешем, AVIF с правильным Content-Type) и
  `s3` (`@aws-sdk/client-s3`, S3-совместимый endpoint, `Cache-Control:
  public, max-age=31536000, immutable`). Публичный URL строится только в
  `toUrl(key)` = `CDN_BASE_URL + '/' + key`. Защита от traversal в локальном
  драйвере — вторая линия (ключ и так формирует сервер).
- `upload-types.ts` — 20 типов загрузок с пресетами: префикс ключа
  (`users/{userId}/avatar`, `news/covers`, `store/products`, …), лимит
  размера, allowlist MIME, пресет изображения (размер/fit/quality AVIF),
  permission (`news.create`, `store.products.edit`, `servers.edit`, …),
  `allowAnonymous` только для `form_upload`.
- `FilesService.upload()` — magic bytes (`file-type`) вместо клиентского
  mimetype → лимит → sharp (`limitInputPixels` против decompression-bomb,
  `rotate()` по EXIF, metadata не переносится, resize, AVIF q55–70) →
  анимированные GIF/WebP хранятся как есть → `put` → запись `File`
  (`TEMP`/`ATTACHED`). `attach()` — привязка TEMP к владельцу (только своим
  uploader'ом), `remove()`, `cleanupOrphans()` (TEMP > 24 ч и DELETED),
  ежедневно в 03:00 таймером процесса.
- Эндпоинты: `POST /files/upload?type=&ownerId=` (multipart `file`, TEMP),
  `DELETE /files/:id` (свой TEMP), `POST|DELETE /users/me/avatar` и
  `/users/me/banner` (замена с удалением предыдущего файла, ключ в
  `User.avatar/banner`).
- ENV (Joi): `STORAGE_DRIVER`, `CDN_BASE_URL`, `UPLOADS_DIR`,
  `STORAGE_BUCKET/ENDPOINT/REGION/ACCESS_KEY/SECRET_KEY` (обязательны при
  `s3`). Зависимости: `sharp`, `file-type@16` (CJS), `@aws-sdk/client-s3`.
- Обёртка `files/sharp.ts`: sharp — CommonJS, `esModuleInterop` включать
  нельзя (ломает `import * as request` в e2e), поэтому единственная точка
  `require` с eslint-исключением.

## Тесты

`test/files.e2e-spec.ts` (6): аватар PNG → AVIF 512×512, ключ в
`User.avatar`, файл в storage, `ATTACHED`, раздача по `/uploads` с
`image/avif` и `immutable`; повторная загрузка удаляет старый файл; текст
под видом PNG → 415; `news_cover` 403 без `news.create` / 201 с ним (TEMP);
400/403 на неверный тип/без входа/avatar через generic; orphan cleanup.

## Не входит

- Привязка загрузок к сущностям в доменах (news/store/forms/reports/
  messages) — по мере появления соответствующих экранов (PHASE 31): сервисы
  вызывают `FilesService.attach(key, uploaderId, ownerType, ownerId)`.
- SVG-загрузки (нужен sanitize) и миниатюры-варианты — при необходимости.
- Реальные S3-credentials (`cdn-files.twomc.su`) — RISKS.md (внешнее).
