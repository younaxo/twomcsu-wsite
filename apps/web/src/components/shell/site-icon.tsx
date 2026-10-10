'use client';

import { Globe } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { faviconUrl, knownSiteIcon } from '@/lib/site/site-icon';
import { BrandIcon } from './brand-icon';

/// Иконка сайта по адресу ссылки (ADR-0102): известный сервис — brand-иконка,
/// иначе фавиконка через защищённый резолвер API; пока грузится и при ошибке —
/// Globe (подтверждение перехода работает в любом случае).
export function SiteIcon({ href, className }: { href: string; className?: string }) {
  let hostname = '';
  try {
    hostname = new URL(href).hostname;
  } catch {
    hostname = '';
  }
  const brand = hostname ? knownSiteIcon(hostname) : null;
  const src = brand ? null : faviconUrl(href);
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');

  return (
    <span
      aria-hidden
      data-testid="site-icon"
      data-kind={brand ? 'brand' : src && state !== 'error' ? 'favicon' : 'globe'}
      className={cn(
        'relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface text-muted-foreground shadow-sm',
        className,
      )}
    >
      {brand ? (
        <BrandIcon id={brand} className="size-4" />
      ) : (
        <>
          {state !== 'loaded' ? <Globe className="size-4" /> : null}
          {src && state !== 'error' ? (
            // eslint-disable-next-line @next/next/no-img-element -- иконка с нашего API-резолвера
            <img
              src={src}
              alt=""
              width={16}
              height={16}
              decoding="async"
              referrerPolicy="no-referrer"
              onLoad={() => setState('loaded')}
              onError={() => setState('error')}
              className={cn('size-4 object-contain', state !== 'loaded' && 'absolute opacity-0')}
            />
          ) : null}
        </>
      )}
    </span>
  );
}
