import type { ReactNode } from 'react';

/// Экран ошибки (срез 8.2, ADR-0124): 404, сбой страницы и сбой всего
/// приложения в «Полдне». Понятный текст и действия — без технических
/// деталей (стека, сообщения исключения, кода). Логотип локальный.
export function ErrorScreen({
  icon,
  title,
  description,
  actions,
  testId,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actions: ReactNode;
  testId: string;
}) {
  return (
    <main
      id="main"
      data-testid={testId}
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground"
    >
      <section className="flex w-full max-w-md flex-col items-center gap-4 rounded-xl bg-surface px-6 py-10 text-center shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element -- локальный логотип, страница должна работать без оптимизатора */}
        <img
          src="/icon.png"
          alt="twomc.su"
          width={64}
          height={64}
          draggable={false}
          className="select-none rounded-lg"
        />
        <span aria-hidden className="text-muted-foreground [&>svg]:size-6">
          {icon}
        </span>
        <h1 className="font-display text-2xl font-bold">{title}</h1>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="flex flex-wrap justify-center gap-2">{actions}</div>
      </section>
    </main>
  );
}
