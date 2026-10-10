'use client';

import { Clock, ExternalLink, Vote } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/admin/page-header';
import { ModuleGate } from '@/components/system/site-availability';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/error-state';
import { SkeletonRows } from '@/components/ui/skeleton';
import { useAuthStore } from '@/lib/auth/store';
import { plural } from '@/lib/format';
import { useVoteSites, type VoteSiteDto } from '@/lib/voting/hooks';

/// Голосование (срез 3.7, ADR-0121): сайты-рейтинги, награда в монетах и
/// таймер до следующего голоса. Ссылки и логотипы задаёт администрация —
/// показываются только http(s)-адреса.

const isWebUrl = (value: string | null): value is string => !!value && /^https?:\/\//i.test(value);

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/// Остаток до следующего голоса — «ЧЧ:ММ:СС».
function formatWait(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

function SiteCard({ site, now }: { site: VoteSiteDto; now: number }) {
  const wait = site.nextVoteAt ? Date.parse(site.nextVoteAt) - now : 0;
  const ready = site.canVoteNow !== null && wait <= 0;
  return (
    <li>
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center" data-testid="vote-site">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {isWebUrl(site.logoUrl) ? (
            // eslint-disable-next-line @next/next/no-img-element -- логотип сайта-рейтинга, задаёт администрация
            <img
              src={site.logoUrl}
              alt=""
              width={40}
              height={40}
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-10 shrink-0 rounded-md object-contain"
            />
          ) : (
            <span
              aria-hidden
              className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary"
            >
              <Vote className="size-5" />
            </span>
          )}
          <div className="flex min-w-0 flex-col gap-1">
            <p className="font-medium">{site.name}</p>
            {site.description ? (
              <p className="text-sm text-muted-foreground">{site.description}</p>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              <Badge tone="primary">
                +{site.rewardCoins}{' '}
                {plural(site.rewardCoins, { one: 'монета', few: 'монеты', many: 'монет' })}
              </Badge>
              <Badge tone="neutral">
                раз в {site.cooldownHours}{' '}
                {plural(site.cooldownHours, { one: 'час', few: 'часа', many: 'часов' })}
              </Badge>
              {site.canVoteNow === null ? null : ready ? (
                <Badge tone="success">Можно голосовать</Badge>
              ) : (
                <Badge tone="warning" icon={<Clock aria-hidden />} data-testid="vote-wait">
                  Через {formatWait(wait)}
                </Badge>
              )}
            </div>
          </div>
        </div>
        {isWebUrl(site.url) ? (
          <Button asChild variant={ready || site.canVoteNow === null ? 'primary' : 'secondary'}>
            <a href={site.url} target="_blank" rel="noopener noreferrer">
              Проголосовать
              <ExternalLink aria-hidden />
            </a>
          </Button>
        ) : null}
      </Card>
    </li>
  );
}

function VoteContent() {
  const user = useAuthStore((state) => (state.status === 'authenticated' ? state.user : null));
  const sites = useVoteSites(!!user);
  const now = useNow(1000);
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-8 md:px-6">
      <PageHeader
        title="Голосование"
        description="Голосуйте за twomc.su на сайтах-рейтингах и получайте монеты."
      />
      <Card variant="sunken" className="text-sm text-muted-foreground" data-testid="vote-hint">
        {user ? (
          <>
            На сайте-рейтинге укажите ник{' '}
            <span className="font-medium text-foreground">{user.username}</span> — так голос
            засчитается вашему аккаунту.
          </>
        ) : (
          'Войдите, чтобы видеть таймер до следующего голоса. На сайте-рейтинге указывайте ник аккаунта twomc.su.'
        )}
      </Card>
      {sites.isPending ? (
        <SkeletonRows rows={3} />
      ) : sites.isError ? (
        <ErrorState error={sites.error} onRetry={() => sites.refetch()} />
      ) : sites.data.length === 0 ? (
        <EmptyState
          icon={<Vote />}
          title="Сайты для голосования пока не подключены"
          description="Как только администрация добавит сайты-рейтинги, они появятся здесь."
        />
      ) : (
        <ul className="flex flex-col gap-3" data-testid="vote-sites">
          {sites.data.map((site) => (
            <SiteCard key={site.id} site={site} now={now} />
          ))}
        </ul>
      )}
    </div>
  );
}

/// Страница модуля «voting» (ADR-0082): выключен или на техработах — понятное состояние.
export default function VotePage() {
  return (
    <ModuleGate module="voting">
      <VoteContent />
    </ModuleGate>
  );
}
