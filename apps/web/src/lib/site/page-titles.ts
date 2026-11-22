import { SITE_NAME } from './config';

/// Заголовки вкладки для статичных маршрутов основного сайта. Единый источник:
/// серверные layout (`export const metadata`) и клиентский RouteTitle для
/// приватных страниц. Итог — «Раздел — twomc.su» (шаблон корневого layout).
export const PAGE_TITLES: Record<string, string> = {
  '/achievements': 'Достижения',
  '/events': 'События',
  '/faq': 'Вопросы и ответы',
  '/feed': 'Лента',
  '/forms': 'Формы',
  '/friends': 'Друзья',
  '/leaderboards': 'Рейтинги',
  '/messages': 'Сообщения',
  '/news': 'Новости',
  '/notifications': 'Уведомления',
  '/rules': 'Правила',
  '/servers': 'Серверы',
  '/settings': 'Настройки профиля',
  '/settings/privacy': 'Приватность',
  '/settings/notifications': 'Настройки уведомлений',
  '/settings/security': 'Безопасность',
  '/settings/punishments': 'Мои наказания',
  '/settings/media': 'Медиа',
  '/settings/showcase': 'Витрина',
  '/settings/linked-accounts': 'Привязки аккаунта',
  '/settings/purchases': 'История покупок',
  '/shop': 'Магазин',
  '/shop/cart': 'Корзина',
  '/shop/checkout': 'Оформление заказа',
  '/shop/orders': 'Мои заказы',
  '/shop/wishlist': 'Избранное',
  '/status': 'Статус серверов',
  '/support': 'Поддержка',
  '/vote': 'Голосование',
};

/// Полный title для клиентской установки: «Раздел — twomc.su».
export function formatPageTitle(title: string): string {
  return `${title} — ${SITE_NAME}`;
}

/// Заголовок маршрута или `null`, если путь динамический/неизвестный.
export function titleForPath(pathname: string | null): string | null {
  if (!pathname) return null;
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return PAGE_TITLES[clean] ?? null;
}
