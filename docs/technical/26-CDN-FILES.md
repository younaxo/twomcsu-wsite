# 26 — CDN / файловое хранилище

# A. Текущая реализация (факт)
- Хранилище: **локальный диск** API-сервера, каталог `UPLOADS_DIR` (default `./uploads`, относительно `apps/api`; в `.gitignore`). Отдаётся Express-static по `UPLOADS_ROUTE = '/uploads'` с `Cache-Control maxAge: 7d` (`main.ts`). CDN, S3 и `cdn-files.twomc.su` в коде **отсутствуют**.
- Multer хранит файл в памяти (`multer.options.ts`), затем `sharp` обрабатывает и пишет на диск (`UploadsService`).
- В БД хранится **относительный публичный путь** вида `/uploads/{kind}/{userId}-{hex}.webp` (не абсолютный URL) — это совместимо с будущим `CDN_BASE_URL`.
- Frontend: `next.config.mjs → images.remotePatterns` разрешает `localhost:4000`, `mc-heads.net`, `minotar.net`, `picsum.photos`.

## Upload endpoints (11)
| Endpoint | Auth / роль | Обработка |
|---|---|---|
| `POST /users/me/avatar` | required | `saveAvatar`: JPEG/PNG/WEBP/GIF, `UPLOAD_MAX_AVATAR_SIZE` (5 МБ), resize **512×512 cover**, вывод **WebP q90**, папка `avatars/` |
| `POST /users/me/banner` | required | `saveBanner`: лимит `UPLOAD_MAX_BANNER_SIZE` (10 МБ), **1920×480 cover**, WebP q90, `banners/` |
| `POST /messages/conversations/:id/messages/upload` | required | `saveMessageAttachment`: расширение по MIME-карте, для `image/*` — `sharp.metadata()` как проверка, для PDF — сигнатура `%PDF-`; имя `{userId}-{hex24}{ext}`, `/uploads/messages/` |
| `POST /admin/news/upload-image` | ADMIN | изображения новостей |
| `POST /admin/achievements/upload-icon` | ADMIN | иконки достижений |
| `POST /admin/emojis`, `PATCH /admin/emojis/:id` | ADMIN | кастомные эмодзи (multipart) |
| `POST /admin/topics/:id/attachments` | OWNER | вложения тем |
| `POST /reports/:reportNumber/attachments` и `.../messages/:messageId/attachments` | required | вложения жалоб |
| `POST /forms/:slug/responses/upload` | **optional** (гости) | файлы ответов форм |

## Особенности реализации
- Тип файла определяется по **клиентскому** `file.mimetype` (Multer), для аватаров/баннеров дальнейшая валидация — сам факт успешного декодирования `sharp`. Magic-bytes проверяются только для PDF.
- Имена: `{userId}-{randomBytes}` — коллизий нет; путь строит сервер (клиент путь не передаёт).
- Защита от traversal при удалении: `resolve(rootDir, relative)` + `absolute.startsWith(rootDir)` — префиксная проверка без разделителя (слабая, LOW).
- `sharp(file.buffer)` вызывается без `animated: true` → для GIF сохраняется **только первый кадр** (анимация теряется). EXIF не переносится (по умолчанию sharp его не копирует).
- Модели файла/владельца **нет** (нет таблицы `File`/`Upload`); ссылки хранятся в полях сущностей (`User.avatar`, `User.banner`, вложения DM/репортов/топиков). Orphan-cleanup отсутствует. Удаление старого аватара — по `publicPath` при замене.
- Реальный формат вывода — **WebP, не AVIF**. AVIF-пайплайна нет (`sharp` поддерживает `.avif()`).
- Статус: локальное хранилище — IMPLEMENTED; CDN — MISSING; AVIF — MISSING; SVG — не принимается (нет в `ALLOWED_IMAGE_MIME_TYPES`).

# B. Целевая архитектура (PROPOSED)
## Конфигурация
`CDN_BASE_URL=https://cdn-files.twomc.su`, `STORAGE_DRIVER=local|s3`, `STORAGE_BUCKET`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY` (secrets). В БД хранится только **ключ** (`users/{userId}/avatar/{uuid}.avif`); публичный URL = `CDN_BASE_URL + '/' + key` строится в одном месте (`FileUrlService.toUrl(key)`). Миграция: текущие значения `/uploads/avatars/x.webp` преобразуются в ключи скриптом (старые файлы переносятся как есть).
## Структура ключей
```text
users/{userId}/avatar/{uuid}.avif        users/{userId}/banner/{uuid}.avif
users/{userId}/attachments/{uuid}.{ext}  messages/{conversationId}/{uuid}.{ext}
news/covers/{uuid}.avif                  news/attachments/{uuid}.{ext}
reports/{reportNumber}/{uuid}.{ext}      forms/{slug}/uploads/{uuid}.{ext}
chat/attachments/{uuid}.{ext}            topics/{topicId}/{uuid}.{ext}
store/products|categories|bundles/{uuid}.avif
servers/icons/{uuid}.avif                achievements|awards|badges|decorations|events|emojis/{uuid}.avif
system/{uuid}.{ext}                      originals/{...same key}  (необязательно)
```
Клиент передаёт только `uploadType` (enum) — префикс, имя и расширение определяет backend; произвольный `path` не принимается.
## Pipeline
`multipart → size limit (по uploadType) → sniff magic bytes (file-type), сверка с allowlist MIME и расширением → decode (sharp, limitInputPixels) → rotate по EXIF → strip metadata → resize по пресету → AVIF (quality ≈ 55–60, effort 4) + thumbnail-варианты → put в storage с Cache-Control: public, max-age=31536000, immutable → запись File`.
Пресеты: avatar 512 (+128 thumb), banner 1920×480 (+960×240), news cover 1600×900 (+640×360), product 800×800 (+300), icons 256. GIF/animated WebP — не конвертировать (`animated: true` или хранить как есть), SVG — только после sanitize (DOMPurify/svgo, без `<script>`, `on*`, внешних ссылок) и отдавать с `Content-Type: image/svg+xml` + `Content-Security-Policy: sandbox`.
## Модель владения (PROPOSED)
```prisma
model File { id String @id @default(cuid()); key String @unique; mime String; size Int
  uploaderId String; ownerType String?; ownerId String?; status FileStatus @default(TEMP)  // TEMP|ATTACHED|DELETED
  createdAt DateTime @default(now()); attachedAt DateTime? }
```
Orphan cleanup (cron): `TEMP` старше 24 ч и `DELETED` удаляются из storage. Права: загрузка — authenticated + permission по `uploadType` (например `news.upload_image`), удаление — владелец или `files.delete`.
## Backup
Файлы CDN входят в бэкап наравне с PostgreSQL (33-DEPLOYMENT.md).
