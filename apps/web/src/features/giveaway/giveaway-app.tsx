'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { GiveawayPage } from './giveaway-page';
import { selectApi, type SelectedApi } from './select-api';
import type { MockScenario } from './mock-api';

/// Dev-панель сценариев мока. Условие записано литералами `process.env.*`
/// прямо здесь: при сборке (NODE_ENV и NEXT_PUBLIC_* инлайнятся) в production оно
/// превращается в `false`, ветка с `import()` вырезается и чанк панели не создаётся.
const DevSwitcher =
  process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_GIVEAWAY_MOCK === '1'
    ? dynamic(() => import('./dev-switcher'), { ssr: false })
    : null;

/// Клиентская точка входа: выбирает API (реальный или dev-мок) и рисует страницу.
/// Реальный HTTP-клиент создаётся сразу; мок подгружается лениво и только в dev.
export function GiveawayApp() {
  const [selected, setSelected] = useState<SelectedApi | null>(null);
  /// Меняется при каждом выборе сценария: страница пересоздаётся с чистым состоянием.
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let cancelled = false;
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

  if (!selected) {
    return (
      <div
        role="status"
        className="flex min-h-dvh items-center justify-center bg-background text-muted-foreground"
      >
        Загружаем…
      </div>
    );
  }
  return (
    <>
      <GiveawayPage key={revision} api={selected.api} autoIssue={selected.autoIssue} />
      {DevSwitcher ? <DevSwitcher current={selected.mock} onSelect={switchScenario} /> : null}
    </>
  );
}
