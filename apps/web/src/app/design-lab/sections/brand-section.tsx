'use client';

import { SITE_ALERT_STYLES, type SiteAlertVariant } from '@twomc/shared';
import Image from 'next/image';
import { useState } from 'react';
import { SocialLinkDialog } from '@/app/admin/settings/_components/social-links-tab';
import { BrandWordmark, type BrandWordmarkSize } from '@/components/shell/brand-wordmark';
import { SITE_ALERT_STYLE_LABELS, SiteAlertView } from '@/components/shell/global-alert-bar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { SITE_LOGO_URL } from '@/lib/site/config';
import { SEASONAL_CAMPAIGNS } from '@/lib/site/seasonal';

const HALLOWEEN_O = SEASONAL_CAMPAIGNS.find((c) => c.id === 'halloween')?.wordmarkO;
const SIZES: { size: BrandWordmarkSize; logo: number; label: string }[] = [
  { size: 'sm', logo: 22, label: 'sm · footer' },
  { size: 'md', logo: 28, label: 'md · header / admin' },
  { size: 'lg', logo: 36, label: 'lg · auth' },
  { size: 'xl', logo: 64, label: 'xl · hero' },
];
const ALERT_VARIANTS: SiteAlertVariant[] = ['info', 'warning', 'danger'];

function Lockup({
  size,
  logo,
  seasonal,
}: {
  size: BrandWordmarkSize;
  logo: number;
  seasonal: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      {/* Основной логотип — всегда один и тот же (ADR-0065). */}
      <Image
        src={SITE_LOGO_URL}
        alt=""
        width={logo}
        height={logo}
        quality={90}
        draggable={false}
        className="shrink-0 rounded-sm"
      />
      <BrandWordmark
        size={size}
        seasonalO={seasonal && HALLOWEEN_O ? { id: 'halloween', src: HALLOWEEN_O } : null}
      />
    </span>
  );
}

/// БРЕНД, ПЛАШКА И ОКНА — production-компоненты (не демо-копии):
/// основной логотип + wordmark с базовой/сезонной «o», глобальная плашка
/// в режимах outline/filled, диалог «Добавить соцсеть».
export function BrandSection() {
  const [dialogOpen, setDialogOpen] = useState(false);
  return (
    <div className="flex flex-col gap-6">
      <Card className="flex flex-col gap-5">
        <h3 className="text-base font-semibold">Логотип и wordmark</h3>
        <p className="text-sm text-muted-foreground">
          Логотип не меняется никогда; сезон может менять только букву «o».
        </p>
        <div className="grid gap-6 md:grid-cols-2">
          {[false, true].map((seasonal) => (
            <div key={String(seasonal)} className="flex flex-col gap-4">
              <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                {seasonal ? 'Сезон: Хэллоуин' : 'По умолчанию'}
              </p>
              {SIZES.map(({ size, logo, label }) => (
                <div key={size} className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Lockup size={size} logo={logo} seasonal={seasonal} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-5">
        <h3 className="text-base font-semibold">Глобальная плашка</h3>
        <div className="grid gap-6 lg:grid-cols-2">
          {SITE_ALERT_STYLES.map((style) => (
            <div key={style} className="flex flex-col gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-subtle-foreground">
                {SITE_ALERT_STYLE_LABELS[style]}
              </p>
              {ALERT_VARIANTS.map((variant) => (
                <div key={variant} className="overflow-hidden rounded-xl bg-background pb-2">
                  <div className="h-8 rounded-b-xl bg-surface shadow-sm" aria-hidden />
                  <SiteAlertView
                    attached
                    className="mx-4"
                    alert={{
                      variant,
                      displayStyle: style,
                      icon:
                        variant === 'info' ? 'info' : variant === 'warning' ? 'clock' : 'wrench',
                      customIcon: null,
                      title: variant === 'danger' ? 'Технические работы' : null,
                      message:
                        variant === 'info'
                          ? 'Открыт набор в команду модераторов.'
                          : variant === 'warning'
                            ? 'Сервер перезапустится через 10 минут.'
                            : 'Магазин недоступен с 22:00 до 23:00.',
                      linkUrl: '/status',
                      linkLabel: 'Подробнее',
                    }}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Диалог</h3>
          <p className="text-sm text-muted-foreground">
            Production-окно «Добавить соцсеть»: шапка, тело, футер, крестик, тёмный scrim.
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>Открыть «Добавить соцсеть»</Button>
        {dialogOpen ? <SocialLinkDialog open onOpenChange={setDialogOpen} initial={null} /> : null}
      </Card>
    </div>
  );
}
