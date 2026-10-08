'use client';

/*
  EMBER — «Раскалённое». Wireframe (desktop ≥1024 слева, 375px справа).

  Публичный сайт — hero = табло статуса, не заголовок
  +--------------------------------------------------------------+   +----------------------------+
  | TwoMC  Новости  Сервера  Магазин  События  Топ  [Поиск ⌘K] (bell) Войти |   | [=] TwoMC   (search)(bell) Войти |
  |                 ^^^^^^^ линия 2px border-primary               |   +----------------------------+
  |  209                  <- AnimatedCounter, font-display 8xl    |   |  209        (6xl)          |
  |  игроков сейчас на 4 серверах                                |   |  игроков сейчас на 4 серверах
  |  Заполненность серверов ==========------  209 / 950 слотов   |   |  ========---- 209/950      |
  |  * Survival #1 128/500  * SkyBlock 64/200  * Creative 17/100 |   |  * Survival #1 128/500     |
  |  o Anarchy офлайн                  ~~~ жар снизу (radial) ~~~ |   |  * SkyBlock 64/200  ...    |
  +--------------------------------------------------------------+   +----------------------------+
  | Сервера (строки с линиями) | Новости (редакционный список) | События + Магазин | Профиль + Уведомления |

  Админ-панель — рамка, сайдбар w-56, рейка активного пункта
  +-- w-56 ---------+-- Админ-панель > Пользователи  [поиск] (bell) [av] --+   +-- [=] Админ-панель > Пользователи (bell) [av] --+
  |  Дашборд        |  Пользователи                 [Экспорт] [Рассылка]  |   |  Пользователи       [Экспорт] [Рассылка]     |
  | |Пользователи   |  | Всего | Онлайн | Новых | Жалобы |   <- линии     |   |  | Всего | Онлайн |  (2 колонки)              |
  |  Модерация   6  |  Все 8  Онлайн 5  Команда 5  Забанены 1  <- Tabs   |   |  Все 8  Онлайн 5  Команда 5  Забанены 1 ->   |
  |  Контент        |  [Ник или тег] [Роль v] [Всё время|30|7] [Фильтры] |   |  [Ник или тег] [Роль v] [...] [Фильтры]     |
  |  Магазин        |  [ ] Игрок ^  Роль  Статус  Наиграно  Регистрация : |   |  <- таблица min-w 760, горизонтальный скролл -> |
  |  Сервера        |  [ ] [av] [prefix] EnderQueen ...       1 280 ч    |   |                                              |
  |  Система        |  Состояния: skeleton | empty | error | forbidden    |   |  Состояния (1 колонка)                       |
  |  [av] younaxo_  |  Контролы: кнопки | поля, select, switch, checkbox  |   |  Контролы (1 колонка)                        |
  +-----------------+-----------------------------------------------------+   +----------------------------------------------+
*/

import type { ComponentType } from 'react';
import type { ShowcaseProps } from '../registry';
import { AdminScene } from './admin-scene';
import { PublicScene } from './public-scene';

/// Витрина направления «Раскалённое»: тема только тёмная, проп `theme` не
/// используется — токены направления уже тёмные.
export const Showcase: ComponentType<ShowcaseProps> = function EmberShowcase() {
  return (
    <div className="flex flex-col gap-12">
      <section id="ember-public" aria-labelledby="ember-public-title" className="scroll-mt-20">
        <h3 id="ember-public-title" className="mb-4 font-display text-xl">
          Публичный сайт
        </h3>
        <div className="overflow-hidden rounded-lg border">
          <PublicScene />
        </div>
      </section>
      <section id="ember-admin" aria-labelledby="ember-admin-title" className="scroll-mt-20">
        <h3 id="ember-admin-title" className="mb-4 font-display text-xl">
          Админ-панель
        </h3>
        <AdminScene />
      </section>
    </div>
  );
};
