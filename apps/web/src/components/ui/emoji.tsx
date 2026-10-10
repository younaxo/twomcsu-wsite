/// Apple Emoji Policy (A15): там, где emoji — элемент дизайна, он должен
/// выглядеть одинаково на всех ОС (Apple-style), а не системным шрифтом.
///
/// - Только через этот компонент и реестр `EMOJI` — не вставлять PNG-адреса и
///   emoji-символы по страницам (guard-тест ADR-0085 запрещает emoji в
///   исходниках UI).
/// - Картинки — из разрешённого пака по базовому адресу
///   `NEXT_PUBLIC_EMOJI_PACK_URL` (например, CDN twomc.su: `<база>/<код>.png`).
///   Пака нет (лицензия не решена — см. RISKS) — emoji не рисуется системным
///   шрифтом (иначе Windows/Android покажут другой вид); остаётся только
///   подпись для screen reader.
/// - SVG-иконки интерфейса (лайки, настройки, назад…) emoji не заменяются.

/// Реестр: имя → код Unicode (для файла пака) и подпись.
export const EMOJI = {
  fire: { code: '1f525', label: 'огонь' },
  heart: { code: '2764-fe0f', label: 'сердце' },
  party: { code: '1f389', label: 'праздник' },
  trophy: { code: '1f3c6', label: 'кубок' },
  sparkles: { code: '2728', label: 'блёстки' },
  thumbsUp: { code: '1f44d', label: 'нравится' },
} as const;

export type EmojiName = keyof typeof EMOJI;

export const EMOJI_PACK_URL = (process.env.NEXT_PUBLIC_EMOJI_PACK_URL || '').replace(/\/+$/, '');

export function emojiSrc(name: EmojiName, base = EMOJI_PACK_URL): string | null {
  const root = base.replace(/\/+$/, '');
  return root ? `${root}/${EMOJI[name].code}.png` : null;
}

export function Emoji({
  name,
  size = 20,
  decorative = false,
  base,
  className,
}: {
  name: EmojiName;
  size?: number;
  /// Чисто декоративный — без подписи для screen reader.
  decorative?: boolean;
  /// Для тестов и design-lab; по умолчанию — из env.
  base?: string;
  className?: string;
}) {
  const src = emojiSrc(name, base ?? EMOJI_PACK_URL);
  const label = EMOJI[name].label;
  if (!src) {
    return decorative ? null : <span className="sr-only">{label}</span>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- статичный пак emoji
    <img
      src={src}
      alt={decorative ? '' : label}
      aria-hidden={decorative || undefined}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      draggable={false}
      data-emoji={name}
      className={className}
      style={{ display: 'inline-block', verticalAlign: '-0.2em' }}
    />
  );
}
