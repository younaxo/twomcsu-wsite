'use client';

import { TriangleAlert } from 'lucide-react';
import { ErrorScreen } from '@/components/system/error-screen';
import { Button } from '@/components/ui/button';
import { SSR_THEME, THEME_INIT_SCRIPT } from '@/lib/theme/theme';
import './fonts';
import './globals.css';

/// Сбой всего приложения, включая корневой layout (срез 8.2, ADR-0124):
/// заменяет `<html>` целиком, поэтому стили и тема подключаются здесь же.
/// Без провайдеров и запросов; «На главную» — полная перезагрузка.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ru" data-theme={SSR_THEME} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <ErrorScreen
          testId="global-error-page"
          icon={<TriangleAlert />}
          title="Сайт временно недоступен"
          description="Произошла ошибка при загрузке twomc.su. Попробуйте ещё раз через минуту."
          actions={
            <>
              <Button onClick={() => reset()}>Попробовать снова</Button>
              <Button asChild variant="secondary">
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- полная перезагрузка после сбоя приложения */}
                <a href="/">На главную</a>
              </Button>
            </>
          }
        />
      </body>
    </html>
  );
}
