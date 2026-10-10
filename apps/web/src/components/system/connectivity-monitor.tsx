'use client';

import { useQueryClient } from '@tanstack/react-query';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { useConnectivity } from '@/lib/site/connectivity';

function useSecondsUntil(at: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (at === null) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [at]);
  return at === null ? null : Math.max(0, Math.ceil((at - now) / 1_000));
}

/// Монитор связи (ADR-0086): события браузера — только повод проверить;
/// при сбое — плашка с повтором; после восстановления — перезапрос данных.
export function ConnectivityMonitor() {
  const client = useQueryClient();
  const pathname = usePathname();
  const status = useConnectivity((state) => state.status);
  const checking = useConnectivity((state) => state.checking);
  const nextCheckAt = useConnectivity((state) => state.nextCheckAt);
  const recoveries = useConnectivity((state) => state.recoveries);
  const check = useConnectivity((state) => state.check);
  const seconds = useSecondsUntil(nextCheckAt);
  const seen = useRef(recoveries);

  useEffect(() => {
    const onChange = () => void check();
    window.addEventListener('online', onChange);
    window.addEventListener('offline', onChange);
    return () => {
      window.removeEventListener('online', onChange);
      window.removeEventListener('offline', onChange);
    };
  }, [check]);

  useEffect(() => {
    if (recoveries === seen.current) return;
    seen.current = recoveries;
    void client.invalidateQueries();
    toast.success('Связь восстановлена');
  }, [recoveries, client]);

  if (status === 'online' || pathname === '/offline') return null;
  const offline = status === 'offline';
  const Icon = offline ? WifiOff : CloudOff;
  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="connectivity-banner"
      data-status={status}
      className="fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] z-floating mx-auto flex max-w-xl items-center gap-3 rounded-xl bg-surface-overlay px-4 py-3 text-sm shadow-lg lg:bottom-4"
    >
      <Icon aria-hidden className="size-5 shrink-0 text-warning" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">
          {offline ? 'Нет подключения к интернету' : 'Сервер twomc.su не отвечает'}
        </p>
        <p className="text-xs text-muted-foreground">
          {checking
            ? 'Проверяем связь…'
            : seconds !== null
              ? `Повторим через ${seconds} с. Уже загруженное остаётся на экране.`
              : 'Уже загруженное остаётся на экране.'}
        </p>
      </div>
      <Button size="sm" variant="secondary" loading={checking} onClick={() => void check()}>
        <RefreshCw />
        Повторить
      </Button>
    </div>
  );
}
