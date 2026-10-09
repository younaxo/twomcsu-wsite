import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { SITE_LOGO_URL, SITE_NAME } from '@/lib/site/config';

/// Официальный логотип с CDN + название «twomc.su» — ссылка на главную.
export function SiteLogo({ className, size = 28 }: { className?: string; size?: number }) {
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
        priority
        className="shrink-0 rounded-sm"
      />
      <span className="font-display text-lg font-bold tracking-tight">{SITE_NAME}</span>
    </Link>
  );
}
