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
  resolveSocialLinks,
  resolveSupportEmail,
  SITE_NAME,
  SITE_TAGLINE,
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

/// Информационный футер публичных страниц: бренд и владелец, e-mail,
/// соцсети, ссылки игрокам, правовые документы, язык, статус серверов,
/// тема, версия и способы оплаты. Лежит в области контента (правее rail).
export function SiteFooter({ className }: { className?: string }) {
  const settings = usePublicSiteSettings();
  const socials = resolveSocialLinks(settings.data);
  const email = resolveSupportEmail(settings.data);
  const year = new Date().getFullYear();
  const legalParts = [
    LEGAL_OWNER.name,
    LEGAL_OWNER.inn && `ИНН ${LEGAL_OWNER.inn}`,
    LEGAL_OWNER.ogrnip && `ОГРНИП ${LEGAL_OWNER.ogrnip}`,
    LEGAL_OWNER.address,
  ].filter(Boolean);

  return (
    <footer data-testid="site-footer" className={cn('border-t bg-surface', className)}>
      <div className="mx-auto flex max-w-[1440px] flex-col gap-10 px-4 py-10 md:px-6">
        <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-[1.4fr_1fr_1fr_1.2fr]">
          <div className="flex flex-col gap-4">
            <SiteLogo size={32} />
            <p className="text-sm text-muted-foreground">{SITE_TAGLINE}</p>
            {legalParts.length > 0 ? (
              <p className="text-xs text-muted-foreground">{legalParts.join(' · ')}</p>
            ) : process.env.NODE_ENV !== 'production' ? (
              <p className="text-xs text-subtle-foreground">
                Юридические данные владельца не заданы (NEXT_PUBLIC_LEGAL_*). В production блок
                скрыт.
              </p>
            ) : null}
            {email ? (
              <a
                href={`mailto:${email}`}
                className="inline-flex items-center gap-2 text-sm hover:text-primary-soft-foreground"
              >
                <Mail aria-hidden className="size-4" />
                {email}
              </a>
            ) : null}
            {socials.length > 0 ? (
              <ul aria-label="Соцсети" className="flex items-center gap-1">
                {socials.map((social) => (
                  <li key={social.id}>
                    <Tooltip content={social.label}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={social.label}
                        className="flex size-9 items-center justify-center rounded border bg-background text-muted-foreground hover:text-foreground"
                      >
                        <BrandIcon id={social.id} />
                      </a>
                    </Tooltip>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

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

        <div className="flex flex-col gap-4 border-t border-border-subtle pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
          <p>
            {email ? (
              <a href={`mailto:${email}`} className="hover:text-foreground">
                Поддержка: {email}
              </a>
            ) : (
              'Поддержка'
            )}
          </p>
          <p className="md:text-center">
            © {year} {SITE_NAME} ·{' '}
            <Tooltip content={BUILD_SHA ? `Сборка ${BUILD_SHA.slice(0, 7)}` : 'Локальная сборка'}>
              <span className="font-mono tabular" tabIndex={0}>
                v{APP_VERSION}
              </span>
            </Tooltip>
          </p>
          <PaymentMethodLogos className="md:justify-end" />
        </div>
      </div>
    </footer>
  );
}
