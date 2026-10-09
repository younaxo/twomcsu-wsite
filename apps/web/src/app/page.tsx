import Link from 'next/link';
import { Button } from '@/components/ui/button';

/// Временная главная (публичный сайт — PHASE 31). Ведёт на вход и в
/// админ-панель; внутренняя лаборатория дизайна — только в dev.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <p className="font-display text-xl font-bold tracking-tight">TwoMC</p>
      <h1 className="text-3xl">Сайт проекта в разработке</h1>
      <p className="max-w-prose text-muted-foreground">
        Публичные страницы появятся позже. Команде проекта доступны вход и админ-панель.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/login">Войти</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/admin">Админ-панель</Link>
        </Button>
        {process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_DESIGN_LAB === '1' ? (
          <Button asChild variant="link">
            <Link href="/design-lab">Design lab</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}
