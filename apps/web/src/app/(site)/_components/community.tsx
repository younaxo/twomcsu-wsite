'use client';

import { ExternalLink, Users } from 'lucide-react';
import { BrandIcon } from '@/components/shell/brand-icon';
import { EmptyState } from '@/components/ui/empty-state';
import { resolveSocialLinks } from '@/lib/site/config';
import { usePublicSiteSettings } from '@/lib/site/hooks';
import { HomeSection } from './section';

const DESCRIPTION: Record<string, string> = {
  telegram: 'Новости, анонсы ивентов и поддержка.',
  discord: 'Голосовые каналы, поиск команды, общение.',
  tiktok: 'Короткие видео с серверов.',
  vk: 'Сообщество проекта.',
  youtube: 'Трейлеры и записи ивентов.',
};

/// Официальные сообщества — из единого socialLinks (настройки сайта → env).
/// Численность участников не показываем, пока нет реальных данных.
export function HomeCommunity() {
  const settings = usePublicSiteSettings();
  const socials = resolveSocialLinks(settings.data);
  return (
    <HomeSection
      id="community"
      eyebrow="Сообщество"
      title="Мы на связи"
      description="Официальные каналы проекта: анонсы, поддержка и общение с другими игроками."
    >
      {socials.length === 0 ? (
        <EmptyState
          size="sm"
          icon={<Users />}
          title="Ссылки на сообщества ещё не опубликованы"
          description="Администрация добавит их в настройках сайта."
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {socials.map((social) => (
            <li key={social.id}>
              <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group flex h-full items-center gap-4 rounded-xl border bg-surface p-5 shadow transition-colors duration-fast hover:bg-surface-hover edge-highlight"
              >
                <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary-soft-foreground [&_svg]:size-6">
                  <BrandIcon id={social.id} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1 font-semibold">
                    {social.label}
                    <ExternalLink aria-hidden className="size-3.5 text-subtle-foreground" />
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    {DESCRIPTION[social.id] ?? ''}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </HomeSection>
  );
}
