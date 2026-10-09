'use client';

import { HomeCommunity } from './_components/community';
import { HomeEvents } from './_components/events-section';
import { HomeFinalCta } from './_components/final-cta';
import { HomeHero } from './_components/hero';
import { HomeNews } from './_components/news-section';
import { HomeQuickStart } from './_components/quick-start';
import { HomeServers } from './_components/servers-section';
import { HomeShop } from './_components/shop-section';
import { HomeShowcase } from './_components/showcase';

/// Главная twomc.su — продаёт проект и игру, а не витрину доната:
/// hero → showcase → сервера → (недавно купили +) магазин → события →
/// новости → как играть (+ промокод START) → сообщество → финальный CTA →
/// footer (shell). Все данные — реальные API; без данных — skeleton/empty state.
export default function HomePage() {
  return (
    <div className="mx-auto flex max-w-[1440px] flex-col gap-16 px-4 py-10 md:gap-24 md:px-6 md:py-16">
      <HomeHero />
      <HomeShowcase />
      <HomeServers />
      <HomeShop />
      <HomeEvents />
      <HomeNews />
      <HomeQuickStart />
      <HomeCommunity />
      <HomeFinalCta />
    </div>
  );
}
