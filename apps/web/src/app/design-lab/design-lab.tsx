'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { DIRECTION } from './direction';
import { ComponentLab } from './sections/component-lab';
import { AuthAdditionsSection } from './sections/auth-additions-section';
import { AuthSection } from './sections/auth-section';
import { BrandSection } from './sections/brand-section';
import { CursorsSection } from './sections/cursors-section';
import { GlobalShellSection } from './sections/global-shell-section';
import { IdentitySeasonalSection } from './sections/identity-seasonal-section';
import { RolePrefixesSection } from './sections/role-prefixes-section';
import { Showcase } from './showcase/showcase';

const SECTIONS = [
  { id: 'direction', label: 'О направлении' },
  { id: 'showcase', label: 'Витрина' },
  { id: 'lab', label: 'Interactions / Component lab' },
  { id: 'shell', label: 'Global shell' },
  { id: 'brand', label: 'Бренд и плашка' },
  { id: 'auth', label: 'Auth' },
  { id: 'auth-extra', label: 'Auth: коды и восстановление' },
  { id: 'cursors', label: 'Курсоры' },
  { id: 'prefixes', label: 'Role prefixes' },
  { id: 'identity', label: 'Профиль и сезоны' },
] as const;

function useViewportWidth(): number | null {
  const [width, setWidth] = useState<number | null>(null);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    update();
    window.addEventListener('resize', update, { passive: true });
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

/// /design-lab — внутренняя лаборатория production-направления «Полдень»:
/// витрина, Interactions / Component lab, Role prefixes.
/// Тема — глобальный ThemeProvider (тёмная по умолчанию), overlay-порталы
/// получают токены с <html>.
export function DesignLab() {
  const viewport = useViewportWidth();

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      <header className="sticky top-0 z-40 border-b bg-surface">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
          <p className="mr-2 text-sm font-semibold">
            twomc.su <span className="text-muted-foreground">· Design lab</span>
          </p>
          <Badge tone="primary">{DIRECTION.name} · production</Badge>
          <ThemeToggle />
          <nav aria-label="Разделы лаборатории" className="flex flex-wrap gap-1 text-sm">
            {SECTIONS.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="rounded-sm px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {s.label}
              </a>
            ))}
          </nav>
          <p className="ml-auto font-mono text-xs tabular text-subtle-foreground" aria-live="off">
            {viewport !== null ? `${viewport}px` : ''}
          </p>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1440px] flex-col gap-16 px-4 py-8">
        <section id="direction" className="scroll-mt-20">
          <DirectionCard />
        </section>

        <section id="showcase" className="scroll-mt-20">
          <SectionHeading
            title="Витрина"
            description="Один набор элементов — navbar, hero, sidebar, кнопки, поля, табы, карточка, таблица, профиль, статус сервера, уведомление, overlay, состояния — в языке «Полдня». Переключайте тему в панели сверху."
          />
          <Showcase />
        </section>

        <section id="lab" className="scroll-mt-20">
          <SectionHeading
            title="Interactions / Component lab"
            description="Ручная проверка floating UI, overlay, форм и данных. Общие функциональные примитивы, оформление — по токенам темы."
          />
          <ComponentLab />
        </section>

        <section id="shell" className="scroll-mt-20">
          <SectionHeading
            title="Global shell"
            description="Межстраничная оболочка twomc.su теми же production-компонентами: rail, header, footer, уведомления, профиль, корзина, чат, язык/валюта, статус серверов, оплата. Desktop / tablet / mobile."
          />
          <GlobalShellSection />
        </section>

        <section id="brand" className="scroll-mt-20">
          <SectionHeading
            title="Бренд, плашка и окна"
            description="Основной логотип и wordmark (базовая и сезонная «o», размеры sm–xl), глобальная плашка outline/filled для info, warning, danger и production-диалог — те же компоненты, что на сайте."
          />
          <BrandSection />
        </section>

        <section id="auth" className="scroll-mt-20">
          <SectionHeading
            title="Auth"
            description="Единая auth-панель: вход, регистрация, код подтверждения и итог входа/привязки Discord и Telegram — те же компоненты, что на /login, /register и /auth/result."
          />
          <AuthSection />
        </section>

        <section id="auth-extra" className="scroll-mt-20">
          <SectionHeading
            title="Auth: spotlight, коды и восстановление"
            description="Карусель реальных скриншотов TwoMC в панели входа и регистрации, подсказка при входе в регистрацию, поля кодов Minecraft (XXX-000-X0X0-0X0 и X0XX0), «Забыли пароль?» по e-mail и по нику с маской e-mail и недоступными провайдерами, «← Вернуться ко входу» — production-компоненты, без запросов к API."
          />
          <AuthAdditionsSection />
        </section>

        <section id="cursors" className="scroll-mt-20">
          <SectionHeading
            title="Курсоры"
            description="Собственный курсор «Полдня»: обычный, ссылка/кнопка, текст, перетаскивание, недоступно. Только мышь/тачпад, с системным fallback."
          />
          <CursorsSection />
        </section>

        <section id="prefixes" className="scroll-mt-20">
          <SectionHeading
            title="Role prefixes"
            description="Официальные PNG-префиксы ролей из resource pack (CDN). Только визуализация роли — права определяет backend."
          />
          <RolePrefixesSection />
        </section>

        <section id="identity" className="scroll-mt-20">
          <SectionHeading
            title="Профиль и сезоны"
            description="Публичный профиль (свой и чужой), 3D-голова, просмотры и оценки, привязанные аккаунты и соцсети, mini profile, баннеры, бейджи и украшения, украшение шапки ON/OFF и ошибка ассета, независимые сезон и эффект, звёзды Дня Победы — production-компоненты на демо-данных."
          />
          <IdentitySeasonalSection />
        </section>
      </main>
    </div>
  );
}

function SectionHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1">
      <h2 className="text-2xl">{title}</h2>
      <p className="max-w-3xl text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function DirectionCard() {
  const spec = DIRECTION;
  return (
    <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-muted-foreground">Направление</p>
          <Badge tone="primary">Production · dark-first</Badge>
        </div>
        <h1 className="mt-1 text-4xl leading-tight md:text-5xl">{spec.name}</h1>
        <p className="mt-2 text-lg text-muted-foreground">{spec.tagline}</p>
        <p className="mt-6 max-w-prose text-base">{spec.character}</p>
        <p className="mt-3 max-w-prose text-sm text-muted-foreground">{spec.source}</p>
        <p className="mt-6 text-sm">
          <span className="font-medium">Подпись направления: </span>
          {spec.signature}
        </p>
      </div>
      <dl className="grid content-start gap-4 rounded-lg border bg-surface p-card-p text-sm">
        <Row term="Шрифты">
          <span className="font-display text-base">{spec.typography.display}</span>
          {' · '}
          {spec.typography.body}
          {' · '}
          <span className="font-mono">{spec.typography.mono}</span>
          <p className="mt-1 text-muted-foreground">{spec.typography.note}</p>
        </Row>
        <Row term="Оранжевый">
          <span className="inline-flex items-center gap-2">
            <span aria-hidden className="inline-block size-4 rounded-sm bg-primary" />
            {spec.color.orange}{' '}
            <span className="font-mono text-xs text-subtle-foreground">{spec.color.orangeHex}</span>
          </span>
          <p className="mt-1 text-muted-foreground">{spec.color.usage}</p>
        </Row>
        <Row term="Нейтрали">{spec.color.neutrals}</Row>
        <Row term="Темы">
          Тёмная — основная (по умолчанию), светлая — вторичная; одни компоненты, разные
          семантические токены.
        </Row>
        <Row term="Поверхности">{spec.surfaces}</Row>
        <Row term="Форма">{spec.shape}</Row>
        <Row term="Плотность">{spec.density}</Row>
        <Row term="Композиция">{spec.composition}</Row>
        <Row term="Движение">{spec.motion}</Row>
        <Row term="Образность">{spec.imagery}</Row>
        <Row term="Риски">
          <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
            {spec.risks.map((risk) => (
              <li key={risk}>{risk}</li>
            ))}
          </ul>
        </Row>
      </dl>
    </div>
  );
}

function Row({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[120px_1fr] sm:gap-3">
      <dt className="text-muted-foreground">{term}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  );
}
