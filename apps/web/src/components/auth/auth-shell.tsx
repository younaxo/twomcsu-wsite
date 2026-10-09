import type { ReactNode } from 'react';

/// Содержимое шага внутри общей auth-панели (`AuthLayout`): заголовок,
/// короткое описание, форма/состояние и вспомогательные ссылки. Сама панель,
/// логотип, переключатель «Вход | Регистрация» и визуал — в layout.
export function AuthShell({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1
          id="auth-title"
          className="font-display text-2xl font-bold leading-tight tracking-tight"
        >
          {title}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </header>
      <div className="flex flex-col gap-4">{children}</div>
      {footer ? (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">{footer}</div>
      ) : null}
    </div>
  );
}
