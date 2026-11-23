# CDN cdn-files.twomc.su (серверная часть)

Статика (картинки сайта, позже медиа-библиотека) отдаётся отдельным origin на VDS 31.76.77.45. Публично только чтение; загрузка только по SSH.
Скрипты: `infrastructure/cdn/`. Общая блокировка SSH: `infrastructure/vds-runner/lib/vds-lock.sh` (см. `docs/runbooks/vds-runner.md`).

## Состав на сервере

| Что | Где |
|---|---|
| Корень раздачи | `/srv/cdn-files` (владелец `twomc`, 755/644) |
| Манифест синхронизации | `/srv/cdn-state/site.manifest` (sha256, путь) |
| nginx | `/etc/nginx/conf.d/cdn-files.conf` (из `server/nginx.cdn.conf.template`) |
| Сертификат | Let's Encrypt, webroot `/var/www/certbot`, продление certbot.timer, deploy-hook `reload-nginx.sh` |
| Квоты | `/etc/cdn-files.conf`: `CDN_QUOTA_MB=2048`, `CDN_MAX_FILE_MB=8`, `CDN_MAX_FILES=5000` |
| Бэкап | `/usr/local/sbin/cdn-files-backup.sh`, cron `/etc/cron.d/cdn-files-backup` 03:17 -> `/srv/backups/cdn-files/cdn-files-YYYYMMDD.tar.gz`, хранится 14 |
| Проверочный файл | `/srv/cdn-files/health.txt` (`ok`) |

## Установка и обновление конфигурации

```bash
infrastructure/cdn/install-cdn.sh
```

Идемпотентно. Первым шагом на сервере `dig +short cdn-files.twomc.su @1.1.1.1`: если ответ не содержит 31.76.77.45, скрипт завершается кодом 10 до изменений nginx и certbot (DNS скрипты не создают).

## Синхронизация картинок сайта (одна команда)

```bash
infrastructure/cdn/sync-cdn.sh --dry-run     # показать, что уйдёт
infrastructure/cdn/sync-cdn.sh               # выложить tracked-файлы apps/web/public
infrastructure/cdn/sync-cdn.sh --ref origin/main
```

Путь на CDN равен пути внутри `apps/web/public` (`assets/brand/x.svg` -> `https://cdn-files.twomc.su/assets/brand/x.svg`).
Выкладываются только png, jpg, jpeg, webp, avif, svg, ico. Проверки локально: расширение из белого списка, безопасное имя, нет «приватных» слов
(secret, private, credential, password, token, .env, backup, dump, key, pem, .map, sql, zip, tar), размер до 8 МБ, тип по сигнатуре (magic bytes),
SVG без script, foreignObject, обработчиков событий и внешних ссылок. На сервере повторно: sha256, лимиты, мягкая квота; удаляются только файлы,
выложенные прошлой синхронизацией (по манифесту), чужие каталоги (например будущая `media/`) не затрагиваются.

### Квота: почему мягкая
Выбрана простая проверка размера в `cdn-apply.sh` (общий размер каталога после выкладки не больше `CDN_QUOTA_MB`, иначе отказ без изменений), а не loop-образ:
на диске 197 ГБ, единственный писатель - скрипт синхронизации по SSH, loop-том добавляет `fstab` и риск незагрузки. Если появится загрузка пользователями
(медиа-библиотека), перейти на отдельный ext4/xfs loop-том или project quota и вынести проверку в сервис загрузки.

## Заголовки (проверять curl -I)

- `X-Content-Type-Options: nosniff` на всех ответах; `X-Robots-Tag: noindex`.
- `Cache-Control: public, max-age=31536000, immutable` для имён с хэшем (`name.3f9a1c2b.png`, `name-<8-64 hex>.webp`, регэксп с обязательной буквой a-f), иначе `public, max-age=300`. На 4xx кэш-заголовки не выдаются.
- CORS: `Access-Control-Allow-Origin` отражает Origin только из `https://twomc.su`, `https://test-website.twomc.su`, `https://giveaway.twomc.su`; всегда `Vary: Origin`. Для чужих Origin заголовка нет.
- SVG: `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'`.
- Методы только GET, HEAD, OPTIONS (иначе 405); `autoindex off`, каталоги и скрытые файлы - 404; исполнения нет (только `try_files` и статические файлы, никакого proxy/fastcgi).
- gzip для svg, ico, css, js, json, шрифтов; MIME для webp и avif заданы явно; `client_max_body_size 1k`.

```bash
curl -sI https://cdn-files.twomc.su/health.txt
curl -sI -H 'Origin: https://twomc.su' https://cdn-files.twomc.su/icons/icon-192.png
curl -sI https://cdn-files.twomc.su/assets/        # 404, листинга нет
```

## Бэкап и восстановление

```bash
ls -l /srv/backups/cdn-files/
tar -xzf /srv/backups/cdn-files/cdn-files-YYYYMMDD.tar.gz -C /srv/cdn-files     # восстановление поверх
```
После восстановления манифест `/srv/cdn-state/site.manifest` остаётся актуальным для файлов сайта; при сомнениях запустить `sync-cdn.sh` (он вернёт файлы сайта).

## Откат
- Конфигурация nginx: `sudo rm /etc/nginx/conf.d/cdn-files.conf && sudo nginx -t && sudo systemctl reload nginx` (сайты стенда не затрагиваются).
- Данные: файлы в `/srv/cdn-files` восстанавливаются из бэкапа; сертификат можно оставить (`sudo certbot delete --cert-name cdn-files.twomc.su` только по решению владельца).
- cron: `sudo rm /etc/cron.d/cdn-files-backup`.

## Подключение Cloudflare позже (без смены URL)
1. DNS `cdn-files` в Cloudflare включить в режим proxied (оранжевое облако); IP origin не меняется. SSL/TLS режим Full (strict): на origin уже валидный сертификат Let's Encrypt (продление по HTTP-01 работает, пока правило Cloudflare не блокирует `/.well-known/acme-challenge/`).
2. Кэш: заголовки уже корректны (`immutable` для хэшированных имён, 5 минут для остальных). Правило Cache Rules: Cache everything по расширениям изображений, Respect origin TTL. `Vary: Origin` сохраняется: в правилах кэша не игнорировать Origin (для CORS), либо ограничить хостом.
3. Реальный IP клиентов: добавить `set_real_ip_from` для диапазонов Cloudflare и `real_ip_header CF-Connecting-IP` в конфиг CDN (как для основного сайта, см. `docs/runbooks/cloudflare-real-ip.md`); `limit_req` иначе будет считать по IP Cloudflare.
4. После смены обновление кэша - purge по URL после перевыкладки файла без хэша в имени; хэшированные имена purge не требуют.
5. Игровой трафик Minecraft через Cloudflare не проксируется (решение Q14); это касается только HTTP-статики.

## Что не сделано в этой серверной части
Медиа-библиотека в админке (загрузка, перекодирование, SVG-очистка), перенос ссылок на `CDN_BASE_URL` в коде сайта, File Browser за basic auth - отдельные задачи (код `apps/**` в эту область не входил).

## Известные ограничения
- Расширения файлов только в нижнем регистре (`a.png`, не `A.PNG`): `sync-cdn.sh` пропускает прочие с причиной, `cdn-apply.sh` на сервере отклоняет их (код 6).
- Ошибка `rsync` на сервере завершает применение кодом 8: устаревшие файлы не удаляются, манифест не обновляется; повторите синхронизацию.
- Бандлы приходят в приватный `~/.twomc-inbox` (700) на VDS; редирект HTTP на HTTPS идёт на фиксированный `https://${CDN_DOMAIN}`, а не на заголовок Host.
- M6 (Cloudflare, позже): `Vary: Origin` и `Access-Control-Allow-Origin` на кэшируемых ответах. Cloudflare по умолчанию может отдать из кэша ответ без ACAO для другого Origin;
  при включении проксирования нужно проверить Cache Rules (ключ кэша с учётом Origin или отдельный хост для CORS-ресурсов) и повторить `curl -I -H 'Origin: ...'` через оба Origin.
- Мягкая квота проверяет размер каталога, а не использует loop/project quota (см. раздел о квоте); при появлении пользовательских загрузок это нужно заменить.
- Остальные замечания низкой серьёзности ревью (L2-L6, L9-L11) - в бэклоге; на безопасность не влияют.
