'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { ErrorScreen } from '@/components/system/error-screen';
import { Button } from '@/components/ui/button';

/// Сбой страницы (срез 8.2, ADR-0124): текст исключения не показывается —
/// только понятное сообщение, повтор и путь на главную.
export default function PageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorScreen
      testId="error-page"
      icon={<TriangleAlert />}
      title="Что-то пошло не так"
      description="Страница не загрузилась из-за ошибки. Попробуйте ещё раз — если не поможет, загляните позже."
      actions={
        <>
          <Button onClick={() => reset()}>Попробовать снова</Button>
          <Button asChild variant="secondary">
            <Link href="/">На главную</Link>
          </Button>
        </>
      }
    />
  );
}
