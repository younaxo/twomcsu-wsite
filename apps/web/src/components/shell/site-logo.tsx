'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';
import { useShellMode } from '@/lib/site/shell-mode';
import { BrandWordmark, type BrandWordmarkSize } from './brand-wordmark';

/// Основной логотип (постоянный, ADR-0065 — сезоны его не меняют) +
/// wordmark «twomc.su» (сезонной может быть только буква «o») — ссылка на главную.
/// На сайте розыгрыша (внешний режим каркаса) — обычная ссылка на основной сайт.
export function SiteLogo({
  className,
  size = 28,
  wordmarkSize = 'md',
}: {
  className?: string;
  size?: number;
  wordmarkSize?: BrandWordmarkSize;
}) {
  const { mainSiteUrl } = useShellMode();
  const classes = cn('inline-flex items-center gap-2 rounded-sm', className);
  const label = `${SITE_NAME} — на главную`;
  const content = (
    <>
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
    </>
  );
  if (mainSiteUrl !== null) {
    return (
      <a href={mainSiteUrl} aria-label={label} className={classes}>
        {content}
      </a>
    );
  }
  return (
    <Link href="/" aria-label={label} className={classes}>
      {content}
    </Link>
  );
}
