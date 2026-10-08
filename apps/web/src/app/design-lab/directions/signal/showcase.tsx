'use client';

/*
  Направление C — SIGNAL «Пульт». Signature: первый экран — статусная таблица
  серверов (tab-лист), навигация — ⌘K по центру toolbar. Сетка 1px видна,
  панели без теней, данные в Martian Mono.

  Публичный сайт, desktop (≥1024px)              375px
  ┌──────────────────────────────────────────┐   ┌──────────────────┐
  │ TwoMC Новости Сервера…  [⌘K Поиск] [b][a]│   │ ≡ TwoMC    [s][b][a]│
  ├──────────────────────────────────────────┤   ├──────────────────┤
  │ ● TwoMC · 4 сервера · 209 онлайн · 12 с  │   │ ● TwoMC · 4 · 209│
  │ Сервер │Версия│ Игроки ▮▮▮│Пинг│MOTD│Стат│   │ Сервер│Версия│…→→│
  │ Surv#1 │1.21.4│128/500 ▮▮ │24мс│ …  │ on │   │ (горизонт. скролл)│
  ├──────────┬──────────┬──────────┬────────┤   ├──────────────────┤
  │ server   │ server   │ server   │ server │   │ server           │
  ├──────────┴───┬──────┴─────┬────┴────────┤   ├──────────────────┤
  │ Новости      │ События    │ Магазин     │   │ Новости … (стек) │
  ├──────────────┴────────┬───┴─────────────┤   ├──────────────────┤
  │ Профиль ▣ ник [tabs]  │ Уведомления     │   │ Профиль / Уведомл│
  └───────────────────────┴─────────────────┘   └──────────────────┘

  Админ-панель, desktop                           375px
  ┌──────────┬───────────────────────────────┐   ┌──────────────────┐
  │ TwoMC adm│ ≡ Админ › Пользователи › Все  │   │ ≡ Админ › … [b][a]│
  │ ▸Дашборд │ ┌──────┬──────┬──────┬──────┐ │   │ ┌───────┬──────┐ │
  │ ▾Пользов.│ │18 420│ ●209 │ 112  │  6   │ │   │ │18 420 │ ●209 │ │
  │  ┃Все    │ ├──────┴──────┴──────┴──────┤ │   │ ├───────┴──────┤ │
  │   Роли   │ │ [поиск][роль][Все|Онл] …  │ │   │ │ фильтры (wrap)│ │
  │   Баны   │ │ ☐ Пользователь Роль … ⋯   │ │   │ │ таблица →→   │ │
  │ ▾Модерац.│ │ ☐ ▣ EnderQueen  …   1280ч │ │   │ ├──────────────┤ │
  │ ▸Контент │ ├────────┬────────┬─────────┤ │   │ │ состояния    │ │
  │ ▸Магазин │ │skeleton│ empty  │ error…  │ │   │ ├──────────────┤ │
  │ ▸Система │ ├────────┴────────┴─────────┤ │   │ │ контролы     │ │
  │          │ │ контролы                  │ │   │ └──────────────┘ │
  └──────────┴───────────────────────────────┘   └──────────────────┘
*/

import type { ComponentType } from 'react';
import type { ShowcaseProps } from '../registry';
import { AdminScene } from './admin-scene';
import { PublicScene } from './public-scene';

export const Showcase: ComponentType<ShowcaseProps> = ({ theme }) => (
  <div className="flex flex-col gap-12">
    <section aria-labelledby="signal-public-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="signal-public-title" className="text-lg font-semibold">
          Публичный сайт
        </h3>
        <p className="text-sm text-muted-foreground">
          Статусная таблица вместо слогана; ⌘K — центр навигации.
        </p>
      </div>
      <PublicScene theme={theme} />
    </section>

    <section aria-labelledby="signal-admin-title" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="signal-admin-title" className="text-lg font-semibold">
          Админ-панель
        </h3>
        <p className="text-sm text-muted-foreground">
          Дерево разделов с изменяемой шириной, таблица — ядро, оранжевый только как сигнал.
        </p>
      </div>
      <AdminScene theme={theme} />
    </section>
  </div>
);
