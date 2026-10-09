'use client';

import { ExternalLink, Mail } from 'lucide-react';
import Link from 'next/link';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { Tooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/cn';
import {
  APP_VERSION,
  BUILD_SHA,
  FOOTER_LEGAL_LINKS,
  FOOTER_PLAYER_LINKS,
  LEGAL_OWNER,
  MOJANG_DISCLAIMER,
  MOJANG_POLICY_URL,
  resolveSocialSlots,
  resolveSupportEmail,
  SITE_DESCRIPTION,
  SITE_NAME,
  SUPPORT,
  type FooterLink,
} from '@/lib/site/config';
import { usePublicSiteSettings } from '@/lib/site/hooks';
import { BrandIcon } from './brand-icon';
import { LocalePopover } from './locale-popover';
import { PaymentMethodLogos } from './payment-method-logos';
import { ServerStatusButton } from './server-status-button';
import { SiteLogo } from './site-logo';

function FooterLinkItem({ link }: { link: FooterLink }) {
  if (!link.available) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground/70" title="Скоро">
        {link.label}
        <span className="rounded-sm bg-muted px-1 text-[10px] uppercase tracking-wide text-subtle-foreground">
          скоро
        </span>
      </span>
    );
  }
  if (link.external) {
    return (
      <a
        href={link.href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
      >
        {link.label}
        <ExternalLink aria-hidden className="size-3.5" />
      </a>
    );
  }
  return (
    <Link href={link.href} className="text-muted-foreground hover:text-foreground">
      {link.label}
    </Link>
  );
}

function LinkColumn({ title, links }: { title: string; links: FooterLink[] }) {
  return (
    <nav aria-label={title} className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">{title}</h2>
      <ul className="flex flex-col gap-1.5 text-sm">
        {links.map((link) => (
          <li key={`${link.href}-${link.label}`}>
            <FooterLinkItem link={link} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/// Информационное примечание о Mojang AB — ссылка на документ внешняя
/// (проходит через External Link Modal, как и любой сторонний переход).
export function MojangDisclaimer({ className }: { className?: string }) {
  return (
    <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>
      {MOJANG_DISCLAIMER.before}
      <a
        href={MOJANG_POLICY_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-0.5 text-foreground underline decoration-border-strong underline-offset-2 hover:decoration-foreground"
      >
        {MOJANG_DISCLAIMER.link}
        <ExternalLink aria-hidden className="size-3" />
      </a>
      {MOJANG_DISCLAIMER.after}
    </p>
  );
}

const socialButtonClassName =
  'flex size-10 items-center justify-center rounded border bg-background text-muted-foreground transition-colors duration-fast [&_svg]:size-5';

/// Все официальные соцсети (Telegram, Discord, YouTube, TikTok, VK) —
/// официальные SVG (Simple Icons), одинаковая высота, aria-label, tooltip.
/// Без ссылки (ещё не задана в настройках сайта/env) — честно недоступна.
export function SocialIcons({ className }: { className?: string }) {
  const settings = usePublicSiteSettings();
  const slots = resolveSocialSlots(settings.data);
  return (
    <ul aria-label="Соцсети" className={cn('flex flex-wrap items-center gap-1.5', className)}>
      {slots.map((social) => (
        <li key={social.key}>
          {social.url ? (
            <Tooltip content={social.label}>
              <a
                href={social.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                data-social={social.platform}
                className={cn(socialButtonClassName, 'hover:bg-muted hover:text-foreground')}
              >
                <BrandIcon id={social.platform} />
              </a>
            </Tooltip>
          ) : (
            <Tooltip content={`${social.label} — ссылка появится скоро`}>
              <button
                type="button"
                aria-label={`${social.label} (скоро)`}
                aria-disabled="true"
                data-social={social.platform}
                className={cn(socialButtonClassName, 'cursor-default opacity-50')}
              >
                <BrandIcon id={social.platform} />
              </button>
            </Tooltip>
          )}
        </li>
      ))}
    </ul>
  );
}

/// Футер публичных страниц — отдельная скруглённая solid-поверхность с
/// боковыми отступами, которая ПРИЖАТА к нижней границе страницы: верхние
/// углы скруглены, снизу ничего нет (ни margin, ни полосы фона). На коротких
/// страницах AppShell (min-h-dvh, main flex-1) держит его у низа viewport;
/// в потоке документа (не fixed/sticky).
export function SiteFooter({ className }: { className?: string }) {
  const settings = usePublicSiteSettings();
  const email = resolveSupportEmail(settings.data);
  const year = new Date().getFullYear();
  const legalParts = [
    LEGAL_OWNER.name,
    LEGAL_OWNER.inn && `ИНН ${LEGAL_OWNER.inn}`,
    LEGAL_OWNER.ogrnip && `ОГРНИП ${LEGAL_OWNER.ogrnip}`,
    LEGAL_OWNER.address,
  ].filter(Boolean);

  return (
    <footer data-testid="site-footer" className={cn('mt-auto px-3 md:px-6', className)}>
      <div
        data-testid="site-footer-surface"
        className="mx-auto flex max-w-[1440px] flex-col gap-10 rounded-t-xl border border-b-0 bg-surface px-5 pb-8 pt-10 shadow-lg edge-highlight max-lg:pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:px-8"
      >
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-[1.6fr_1fr_1fr_1fr_1.1fr]">
          <div className="flex flex-col gap-4">
            <SiteLogo size={32} />
            <p className="max-w-sm text-sm text-muted-foreground">{SITE_DESCRIPTION}</p>
            <MojangDisclaimer className="max-w-sm" />
            <SocialIcons />
          </div>

          <nav aria-label="Поддержка" className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Поддержка</h2>
            <ul className="flex flex-col gap-1.5 text-sm">
              <li>
                <a
                  href={`mailto:${email}`}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Mail aria-hidden className="size-4" />
                  {email}
                </a>
              </li>
              <li>
                <a
                  href={`mailto:${SUPPORT.adminEmail}`}
                  aria-label={`Администрация: ${SUPPORT.adminEmail}`}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <Mail aria-hidden className="size-4" />
                  {SUPPORT.adminEmail}
                </a>
              </li>
              <li>
                <a
                  href={SUPPORT.telegram.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Telegram поддержки: ${SUPPORT.telegram.handle}`}
                  className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground"
                >
                  <BrandIcon id="telegram" className="size-4" />
                  {SUPPORT.telegram.handle}
                  <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </li>
            </ul>
          </nav>

          <LinkColumn title="Игрокам" links={FOOTER_PLAYER_LINKS} />
          <LinkColumn title="Правовая информация" links={FOOTER_LEGAL_LINKS} />

          <div className="flex flex-col gap-3 xl:items-end">
            <LocalePopover variant="footer" />
            <ServerStatusButton />
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              Тема
              <ThemeToggle />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-6 text-xs text-muted-foreground">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p data-testid="legal-owner">{legalParts.join(' · ')}</p>
            <PaymentMethodLogos className="md:justify-end" />
          </div>
          <p>
            © {year} {SITE_NAME} ·{' '}
            <Tooltip content={BUILD_SHA ? `Сборка ${BUILD_SHA.slice(0, 7)}` : 'Локальная сборка'}>
              <span className="font-mono tabular" tabIndex={0}>
                v{APP_VERSION}
              </span>
            </Tooltip>
          </p>
        </div>
      </div>
    </footer>
  );
}
