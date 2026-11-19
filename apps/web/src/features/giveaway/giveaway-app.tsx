'use client';

import { useEffect, useState } from 'react';
import { GiveawayPage } from './giveaway-page';
import { selectApi, type SelectedApi } from './select-api';

/// Клиентская точка входа: выбирает API (реальный или dev-мок) и рисует страницу.
/// Реальный HTTP-клиент создаётся сразу; мок подгружается лениво и только в dev.
export function GiveawayApp() {
  const [selected, setSelected] = useState<SelectedApi | null>(null);
  useEffect(() => {
    let cancelled = false;
    void selectApi(window.location.search).then((value) => {
      if (!cancelled) setSelected(value);
    });
    return () => {
      cancelled = true;
    };
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
  return <GiveawayPage api={selected.api} autoIssue={selected.autoIssue} />;
}
