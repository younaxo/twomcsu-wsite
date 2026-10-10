import type { Metadata } from 'next';
import { SearchX } from 'lucide-react';
import Link from 'next/link';
import { ErrorScreen } from '@/components/system/error-screen';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'Страница не найдена',
  robots: { index: false, follow: false },
};

/// 404 (срез 8.2, ADR-0124): несуществующий адрес или `notFound()`.
export default function NotFound() {
  return (
    <ErrorScreen
      testId="not-found-page"
      icon={<SearchX />}
      title="Страница не найдена"
      description="Такой страницы нет: возможно, ссылка устарела или в адресе опечатка."
      actions={
        <>
          <Button asChild>
            <Link href="/">На главную</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/support">Обращения</Link>
          </Button>
        </>
      }
    />
  );
}
