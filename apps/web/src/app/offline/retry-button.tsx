'use client';

import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/// Повтор — перезагрузка текущей страницы (Service Worker снова пойдёт в сеть).
export function RetryButton() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RefreshCw />
      Повторить
    </Button>
  );
}
