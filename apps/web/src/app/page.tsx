import Link from 'next/link';

/// Временная заглушка главной страницы (публичный сайт — PHASE 31).
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-4 py-16">
      <h1 className="text-3xl font-semibold">TwoMC</h1>
      <p className="max-w-prose text-muted-foreground">
        Сайт находится в разработке. Публичные страницы появятся после выбора дизайн-направления.
      </p>
      <ul className="flex flex-wrap gap-4 text-sm">
        <li>
          <Link className="underline underline-offset-4 hover:text-primary" href="/design-lab">
            Design lab — три направления дизайна
          </Link>
        </li>
      </ul>
    </main>
  );
}
