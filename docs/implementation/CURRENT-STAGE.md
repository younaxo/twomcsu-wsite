# Текущий этап (correction / completion stage) — требования владельца

Источник: сообщения владельца 2026-10-10. Этап = пакет **A–E + B5 + A11–A16**.
После него: тесты → CI GREEN → merge → sync main → финальный audit →
CHECKPOINT → подготовка к compact → **ABSOLUTE STOP** (ждать владельца).
DONATION PRIVILEGES — следующий отдельный этап, NOT STARTED
(`docs/donations/REQUIREMENTS.md`).

Порядок: 1) закончить текущие PR; 2) B5 Profile; 3) финальные Auth additions
(A11–A16); 4) C Seasonal; 5) D Design Lab; 6) E full QA; 7) регрессии; 8) full tests/build/security; 9) merge всех PR; 10) sync main; 11) финальный
audit; 12) CHECKPOINT; 13) Donation requirements; 14) закрыть ненужные
процессы; 15) get_usage; 16) финальный отчёт; 17) ABSOLUTE STOP.

## Уже сделано

A1–A10 (#70), B1–B3 (#71), B4 (#72), C1–C3 (#73) — см. CHECKPOINT.

## B5 — Профиль (сообщение с деталями потеряно при сбое; восстановлено по

сводке владельца)

- 3D-голова Minecraft рядом с аватаром.
- `younaxo` → MinecraftAccount `younaxo_`: профиль открывается и по алиасу
  входа (LoginAlias), и по Minecraft-нику привязки.
- Кнопка «Редактировать профиль» в правом верхнем углу (свой профиль).
- Просмотры профиля без учёта собственных просмотров.
- Like / dislike профиля.
- Привязанные Discord / Telegram в профиле (без раскрытия лишнего).
- Пользовательские ссылки соцсетей.
- Responsive QA.

## A11 — Registration Spotlight

- При ВХОДЕ в регистрацию (registration-entry state, не на каждом render;
  на Login — нет) — onboarding spotlight/coachmark: AuthShell слегка
  затемняется, кнопка «Как зарегистрироваться» остаётся выделенной над
  затемнением и кликабельной; рядом coachmark «Впервые здесь? Посмотрите
  короткую инструкцию по регистрации.» с действиями [Как зарегистрироваться]
  [Мне понятно].
- Позиционирование относительно реальной кнопки (production Popover /
  coachmark), responsive, resize, keyboard, Escape, focus trap только где
  уместно; без абсолютных координат под один экран.
- «Мне понятно» закрывает spotlight; «Как зарегистрироваться» открывает
  tutorial; после закрытия tutorial — возврат к форме.
- Заменяет прежнее автооткрытие tutorial при входе в регистрацию.

## A12 — Форматы кодов Minecraft

- Большой код привязки: `XXX-000-X0X0-0X0` (X — A–Z, 0 — цифра), regex
  `[A-Z]{3}-[0-9]{3}-[A-Z][0-9][A-Z][0-9]-[0-9][A-Z][0-9]`; 13 значимых + 3
  дефиса = 16 символов. Не писать «15 символов» нигде.
- Короткий код подтверждения: `X0XX0`, regex `[A-Z][0-9][A-Z]{2}[0-9]`, 5.
- Tutorial: в названиях шагов — длина («Получение кода привязки (16
  символов)», «Ввод кода привязки (16 символов)», «Подтверждение Minecraft (5
  символов)»); шаг 3 — блок «Пример формата: XXX-000-X0X0-0X0»; шаг 5 —
  «Пример формата: X0XX0» (не K7Q2M); monospace, «Полдень».
- Поле большого кода: uppercase, только допустимые символы, дефисы
  автоматически, paste (в т.ч. `ABC123A1B23C4` → нормализация), Backspace,
  invalid/loading/disabled, a11y.
- Короткий код: 5 custom cells, позиции буква/цифра, paste, клавиатура,
  Backspace, autofocus, invalid/success/disabled/loading.
- Генерация — только сервер, crypto RNG; сохранить: one-time, TTL, rate
  limit, anti-bruteforce, транзакционность, без логов в production, без
  повторной привязки.

## A13 — Восстановление пароля по нику

- Переключатель [По e-mail] [По нику] в том же AuthShell.
- По e-mail: generic-ответ, ссылка — если аккаунт есть; без различий HTTP.
- По нику: backend находит аккаунт, показывает маску e-mail (backend-side,
  например `y***o@i*****.com`), пользователь вводит ПОЛНЫЙ e-mail; совпал
  (trim + нормализация регистра) — настоящая ссылка сброса; нет — без
  подробностей.
- Токен: crypto, one-time, TTL, server-side, инвалидация после
  использования и после смены пароля, без логов и аналитики. Пароль по почте
  не отправлять.
- Anti-enumeration: rate limit, generic errors, timing awareness,
  Turnstile там, где он уже в auth-архитектуре; e-mail — private.
- Forgot: «← Вернуться ко входу» — ArrowLeft из icon system, лёгкий сдвиг на
  hover/focus, reduced-motion.

## A14 — Восстановление через Discord / Telegram (только UI)

- Только если у аккаунта привязан провайдер (известно после разрешённого
  lookup): плитка «Сброс через Discord/Telegram» — disabled, «Скоро». Без
  username/ID провайдера, без fake-кнопок.

## A15 — Apple Emoji Policy

- Где emoji — элемент дизайна, единый Apple-style вид (reference:
  emojipedia.org/apple) через центральный компонент `Emoji`/registry; без
  россыпи PNG URL и без OS-native рендера в таких местах; SVG-иконки UI не
  заменять emoji.
- Лицензия: не скрейпить/хотлинкать/перепаковывать Apple artwork без
  разрешения; если нужен разрешённый пак — 🚫 решение владельца, архитектуру
  подготовить.

## Хост

Владелец разрешил использовать хост для задач проекта (assets, CDN,
проверка конфигурации) — только когда действительно нужно; credentials будут
в локальном ignored ENV (`HOST_SSH_*`), никогда не в Git/docs/PR/логах.
Сначала inspect, без разрушительных действий (DNS, данные, firewall,
секреты, чужие сервисы). Сейчас данные не заполнены.

## Design Lab и тесты этих пунктов

- Превью: Spotlight, кнопка, «Мне понятно», шаги 3 и 5 с pattern, поля
  большого и короткого кода, Forgot по e-mail и по нику, маска e-mail,
  disabled Discord/Telegram, «← Вернуться ко входу».
- Тесты: spotlight на регистрации / нет на входе, кнопка интерактивна, «Мне
  понятно», tutorial; форматы, отсутствие «15 символов», reject неверного
  pattern, нормализация paste; recovery e-mail (valid, unknown, rate limit,
  generic, токен, expiration, one-time), по нику (маска, полный e-mail,
  верный/неверный, нормализация, enumeration), провайдеры (плитки, без
  деталей).
