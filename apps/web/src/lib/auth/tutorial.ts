/// Обучающий tutorial регистрации поверх auth-панели (ADR-0072).
/// Вся конфигурация — здесь: этапы, слоты скриншотов, команда, видео и правило
/// показа. Компонент `AuthTutorial` только рисует этот конфиг.

export interface TutorialImage {
  /// Путь к реальному скриншоту (`/assets/tutorial/…` или CDN twomc.su);
  /// `null` — скриншота ещё нет, показывается явно помеченный временный слот.
  src: string | null;
  alt: string;
  width?: number;
  height?: number;
}

export interface TutorialStep {
  id: string;
  title: string;
  /// Короткое объяснение (1–2 предложения).
  description: string;
  /// Нумерованные действия этапа (если есть).
  points?: string[];
  /// Команда для ввода в Minecraft (показывается моноширинно с копированием).
  command?: string;
  /// Пример кода — только чтобы показать формат; реальный код выдаёт сервер.
  example?: { label: string; value: string };
  image: TutorialImage;
}

export type TutorialVideoPlatform = 'youtube' | 'rutube';

/// Допустимые домены видео — чтобы в конфиг не попала посторонняя ссылка.
const VIDEO_HOSTS: Record<TutorialVideoPlatform, string[]> = {
  youtube: ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com'],
  rutube: ['rutube.ru', 'www.rutube.ru'],
};

export function validVideoUrl(
  platform: TutorialVideoPlatform,
  raw: string | undefined,
): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && VIDEO_HOSTS[platform].includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/// Видео-инструкции: URL задаются env (`NEXT_PUBLIC_TUTORIAL_YOUTUBE_URL`,
/// `NEXT_PUBLIC_TUTORIAL_RUTUBE_URL`); пусто/чужой домен — кнопки нет.
export const TUTORIAL_VIDEOS: Record<TutorialVideoPlatform, string | null> = {
  youtube: validVideoUrl('youtube', process.env.NEXT_PUBLIC_TUTORIAL_YOUTUBE_URL),
  rutube: validVideoUrl('rutube', process.env.NEXT_PUBLIC_TUTORIAL_RUTUBE_URL),
};

export const SITE_CONNECT_COMMAND = '/site-connect';

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'register',
    title: 'Создайте аккаунт',
    description: 'Заполните форму регистрации на этой странице.',
    points: [
      'Введите e-mail',
      'Укажите игровой ник — тот, с которым играете на TwoMC',
      'Придумайте пароль и повторите его',
      'Если есть — укажите реферальный код',
      'Примите обязательные согласия',
      'Подтвердите почту кодом из письма',
    ],
    image: { src: null, alt: 'Экран регистрации twomc.su' },
  },
  {
    id: 'site-connect',
    title: 'Получите ссылку в Minecraft',
    description:
      'Зайдите на сервер TwoMC под ником, который указали при регистрации, и введите команду. Сервер пришлёт в чат персональную ссылку.',
    command: SITE_CONNECT_COMMAND,
    image: { src: null, alt: 'Чат Minecraft: команда /site-connect и ссылка от сервера' },
  },
  {
    id: 'open-link',
    title: 'Откройте ссылку',
    description:
      'Откройте ссылку из чата. На странице появится одноразовый код из 15 символов — скопируйте его.',
    example: { label: 'Формат кода', value: '15 символов' },
    image: { src: null, alt: 'Страница с 15-символьным кодом привязки' },
  },
  {
    id: 'enter-code',
    title: 'Подтвердите Minecraft-аккаунт',
    description:
      'Вернитесь к регистрации и вставьте 15-символьный код в поле «Код привязки Minecraft».',
    image: { src: null, alt: 'Поле «Код привязки Minecraft» в регистрации' },
  },
  {
    id: 'confirm-in-game',
    title: 'Подтвердите привязку в игре',
    description:
      'Сайт покажет код из 5 символов. Введите его в игре командой ниже — так сервер подтвердит, что аккаунт ваш.',
    command: `${SITE_CONNECT_COMMAND} <код>`,
    example: { label: 'Пример формата', value: 'K7Q2M' },
    image: { src: null, alt: 'Сайт показывает 5-символьный код, Minecraft его принимает' },
  },
  {
    id: 'done',
    title: 'Готово!',
    description: 'Регистрация завершена — можно переходить в профиль.',
    points: ['Почта подтверждена', 'Minecraft-аккаунт подтверждён', 'Аккаунт twomc.su создан'],
    image: { src: null, alt: 'Регистрация завершена' },
  },
];

/// ВРЕМЕННО (разработка и проверка интерфейса): tutorial открывается при
/// каждом открытии auth-экрана. Production-режим — `false`: только при
/// регистрации и только если человек его ещё не видел.
export const FORCE_AUTH_TUTORIAL = true;

export const TUTORIAL_SEEN_KEY = 'twomc.auth-tutorial.seen';

/// Страницы входа в auth-панель, где tutorial может открываться сам (не на
/// экранах результата, ссылки /site-connect и восстановления пароля).
const TUTORIAL_ENTRY_PATHS = ['/login', '/register'];

export function shouldShowAuthTutorial(input: {
  pathname: string;
  force?: boolean;
  seen: boolean;
}): boolean {
  if (!TUTORIAL_ENTRY_PATHS.includes(input.pathname)) return false;
  if (input.force ?? FORCE_AUTH_TUTORIAL) return true;
  return input.pathname === '/register' && !input.seen;
}
