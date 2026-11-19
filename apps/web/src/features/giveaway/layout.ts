/// Раскладка страницы розыгрыша. По умолчанию - новая (разделы без карточек).
/// Старый карточный вариант сохранён и включается только вне production
/// параметром `?layout=cards` (dev-переключатель; в production параметр игнорируется).
export type GiveawayLayout = 'default' | 'cards';

export function resolveLayout(
  search: string,
  production: boolean = process.env.NODE_ENV === 'production',
): GiveawayLayout {
  if (production) return 'default';
  return new URLSearchParams(search).get('layout') === 'cards' ? 'cards' : 'default';
}
