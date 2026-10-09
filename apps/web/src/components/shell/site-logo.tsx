import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';
import { BrandWordmark, type BrandWordmarkSize } from './brand-wordmark';

/// Основной логотип (постоянный, ADR-0065 — сезоны его не меняют) +
/// wordmark «twomc.su» (сезонной может быть только буква «o») — ссылка на главную.
export function SiteLogo({
  className,
  size = 28,
  wordmarkSize = 'md',
}: {
  className?: string;
  size?: number;
  wordmarkSize?: BrandWordmarkSize;
}) {
  return (
    <Link
      href="/"
      aria-label={`${SITE_NAME} — на главную`}
      className={cn('inline-flex items-center gap-2 rounded-sm', className)}
    >
      <Image
        src={SITE_LOGO_URL}
        alt=""
        width={size}
        height={size}
        quality={90}
        priority
        draggable={false}
        data-logo="main"
        className="shrink-0 select-none rounded-sm"
      />
      <BrandWordmark size={wordmarkSize} />
    </Link>
  );
}
