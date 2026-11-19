'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { SiteFooter } from '@/components/shell/site-footer';
import { SiteHeader } from '@/components/shell/site-header';
import { ShellModeProvider } from '@/lib/site/shell-mode';
import { GiveawayPage } from './giveaway-page';
import { GiveawayResults } from './giveaway-results';
import { TestBadge } from './test-badge';
import { useLiveResults } from './use-live-results';
import { resolveLayout, type GiveawayLayout } from './layout';
import { selectApi, type SelectedApi } from './select-api';
import type { MockScenario } from './mock-api';

/// Dev-панель сценариев мока. Условие записано литералами `process.env.*`
/// прямо здесь: при сборке (NODE_ENV и NEXT_PUBLIC_* инлайнятся) в production оно
/// превращается в `false`, ветка с `import()` вырезается и чанк панели не создаётся.
const DevSwitcher =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_GIVEAWAY_MOCK === '1'
    ? dynamic(() => import('./dev-switcher'), { ssr: false })
    : null;

/// Сцена: пока итогов нет - обычная страница; при state === 'results' - эфир победителей.
/// Ошибки итогов (live) страницу не ломают: остаётся обычный вид. Тест - только для админ-сессии.
export function GiveawayStage({
  selected,
  layout,
}: {
  selected: SelectedApi;
  layout: GiveawayLayout;
}) {
  const live = useLiveResults(selected.results, selected.mode);
  const test = selected.mode === 'test';
  if (live.kind === 'ready' && live.data.state === 'results') {
    return <GiveawayResults data={live.data} />;
  }
  if (test && live.kind === 'error') {
    return (
      <main id="main" className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
        <TestBadge />
        <p role="alert" className="text-center text-foreground">
          {live.error === 'unauthorized'
            ? 'Тестовый эфир доступен только администратору: войдите в админку.'
            : live.error === 'test_disabled'
              ? 'Тестовый режим выключен.'
              : 'Не удалось загрузить тестовый эфир.'}
        </p>
      </main>
    );
  }
  const page = (
    <GiveawayPage api={selected.api} autoIssue={selected.autoIssue} layout={layout} />
  );
  if (!test) return page;
  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 pt-4">
        <TestBadge />
      </div>
      {page}
    </>
  );
}

/// Клиентская точка входа: выбирает API (реальный или dev-мок) и рисует страницу.
/// Реальный HTTP-клиент создаётся сразу; мок подгружается лениво и только в dev.
export function GiveawayApp({ mainSiteUrl = null }: { mainSiteUrl?: string | null } = {}) {
  const [selected, setSelected] = useState<SelectedApi | null>(null);
  /// Меняется при каждом выборе сценария: страница пересоздаётся с чистым состоянием.
  const [revision, setRevision] = useState(0);
  /// `?layout=cards` (прежний карточный вид) действует только вне production.
  const [layout, setLayout] = useState<GiveawayLayout>('default');
  useEffect(() => {
    let cancelled = false;
    setLayout(resolveLayout(window.location.search));
    void selectApi(window.location.search).then((value) => {
      if (!cancelled) setSelected(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const switchScenario = useCallback((scenario: MockScenario) => {
    const params = new URLSearchParams(window.location.search);
    params.set('mock', scenario);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    void selectApi(`?${params.toString()}`).then((value) => {
      setSelected(value);
      setRevision((n) => n + 1);
    });
  }, []);

  // Общий каркас основного сайта: шапка и футер те же компоненты; на сайте розыгрыша
  // (mainSiteUrl) ссылки ведут на основной сайт, запросов к его API нет, «o» без цвета.
  return (
    <ShellModeProvider value={{ mainSiteUrl, monochromeLogo: mainSiteUrl !== null }}>
      <div className="flex min-h-dvh flex-col bg-background text-foreground">
        <SiteHeader />
        {selected ? (
          <GiveawayStage key={revision} selected={selected} layout={layout} />
        ) : (
          <main
            id="main"
            role="status"
            className="flex flex-1 items-center justify-center text-muted-foreground"
          >
            Загружаем…
          </main>
        )}
        <SiteFooter />
      </div>
      {selected && DevSwitcher ? (
        <DevSwitcher current={selected.mock} onSelect={switchScenario} />
      ) : null}
    </ShellModeProvider>
  );
}
