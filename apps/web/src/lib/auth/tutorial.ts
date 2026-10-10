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
  /// Короткая подпись для навигации по шагам (1–2 слова).
  short: string;
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
/// `NEXT_PUBLIC_TUTORIAL_RUTUBE_URL`). Пусто/чужой домен — кнопка видна, но
/// недоступна с подсказкой «Видео готовится» (никогда не ведёт на `#`).
export const TUTORIAL_VIDEOS: Record<TutorialVideoPlatform, string | null> = {
  youtube: validVideoUrl('youtube', process.env.NEXT_PUBLIC_TUTORIAL_YOUTUBE_URL),
  rutube: validVideoUrl('rutube', process.env.NEXT_PUBLIC_TUTORIAL_RUTUBE_URL),
};

/// Официальный логотип RuTube: в Simple Icons его нет, рисовать «похожий» —
/// нельзя. Файл от владельца кладётся в `public/assets/brand/rutube.svg` и
/// включается здесь; до этого — нейтральная иконка воспроизведения.
export const RUTUBE_ICON_SRC: string | null = null;

export const SITE_CONNECT_COMMAND = '/site-connect';

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'register',
    short: 'Регистрация',
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
    short: 'Команда',
    title: 'Получите ссылку в Minecraft',
    description:
      'Зайдите на сервер TwoMC под ником, который указали при регистрации, и введите команду. Сервер пришлёт в чат персональную ссылку.',
    command: SITE_CONNECT_COMMAND,
    image: { src: null, alt: 'Чат Minecraft: команда /site-connect и ссылка от сервера' },
  },
  {
    id: 'open-link',
    short: 'Ссылка',
    title: 'Откройте ссылку',
    description:
      'Откройте ссылку из чата. На странице появится одноразовый код из 15 символов — скопируйте его.',
    example: { label: 'Формат кода', value: '15 символов' },
    image: { src: null, alt: 'Страница с 15-символьным кодом привязки' },
  },
  {
    id: 'enter-code',
    short: 'Код из 15',
    title: 'Подтвердите Minecraft-аккаунт',
    description:
      'Вернитесь к регистрации и вставьте 15-символьный код в поле «Код привязки Minecraft».',
    image: { src: null, alt: 'Поле «Код привязки Minecraft» в регистрации' },
  },
  {
    id: 'confirm-in-game',
    short: 'Код из 5',
    title: 'Подтвердите привязку в игре',
    description:
      'Сайт покажет код из 5 символов. Введите его в игре командой ниже — так сервер подтвердит, что аккаунт ваш.',
    command: `${SITE_CONNECT_COMMAND} <код>`,
    example: { label: 'Пример формата', value: 'K7Q2M' },
    image: { src: null, alt: 'Сайт показывает 5-символьный код, Minecraft его принимает' },
  },
  {
    id: 'done',
    short: 'Готово',
    title: 'Готово!',
    description: 'Регистрация завершена — можно переходить в профиль.',
    points: ['Почта подтверждена', 'Minecraft-аккаунт подтверждён', 'Аккаунт twomc.su создан'],
    image: { src: null, alt: 'Регистрация завершена' },
  },
];

/// Tutorial открывается сам ТОЛЬКО в регистрации (ADR-0087): при входе на
/// `/register`, в том числе при переключении «Вход → Регистрация». На обычном
/// «Вход» сам не открывается. Один раз за вкладку (sessionStorage): закрытый
/// tutorial не всплывает снова при перезагрузке посреди регистрации; открыть
/// вручную можно кнопкой «Как зарегистрироваться».
export const TUTORIAL_SHOWN_KEY = 'twomc.auth-tutorial.shown';

export function shouldShowAuthTutorial(input: { pathname: string; shown: boolean }): boolean {
  return input.pathname === '/register' && !input.shown;
}
