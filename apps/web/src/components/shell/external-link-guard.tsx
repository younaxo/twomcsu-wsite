'use client';

import { ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogBody,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { classifyLink, describeExternalUrl } from '@/lib/site/external-links';

/// Глобальный перехватчик переходов на сторонние сайты: один слушатель клика
/// на document (capture) находит ближайший `<a href>`, и если ссылка —
/// внешняя (не allowlist `lib/site/external-links.ts`, не mailto/tel/hash/
/// внутренняя), показывает подтверждение с hostname и адресом. После
/// «Перейти» ссылка открывается в новой вкладке с `noopener,noreferrer`.
/// javascript:/data: и битые URL не открываются никогда.
/// Отдельная логика для соцсетей/Mojang/Telegram поддержки не нужна —
/// все проходят через этот guard. `data-external-confirmed` на ссылке
/// отключает перехват (например, уже подтверждённый переход).

export function ExternalLinkGuard({ children }: { children?: React.ReactNode }) {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const target = event.target as Element | null;
      const anchor = target?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!anchor || anchor.dataset.externalConfirmed === 'true') return;
      const href = anchor.getAttribute('href');
      const kind = classifyLink(href, window.location.origin);
      if (kind === 'blocked') {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (kind !== 'external') return;
      event.preventDefault();
      event.stopPropagation();
      setPending(anchor.href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  const proceed = useCallback(() => {
    if (!pending) return;
    const url = pending;
    setPending(null);
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    if (opened) {
      opened.opener = null;
    }
  }, [pending]);

  const info = pending ? describeExternalUrl(pending) : null;

  return (
    <>
      {children}
      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => (open ? null : setPending(null))}
      >
        <AlertDialogContent data-testid="external-link-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Вы переходите на внешний сайт</AlertDialogTitle>
            <AlertDialogDescription>
              Вы покидаете twomc.su. twomc.su не отвечает за содержимое стороннего ресурса.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogBody>
            {info ? (
              <div className="rounded border bg-surface-sunken px-3 py-2 text-sm">
                <p className="font-semibold" data-testid="external-link-host">
                  {info.hostname}
                </p>
                <p
                  className="mt-0.5 break-all font-mono text-xs text-muted-foreground"
                  data-testid="external-link-url"
                >
                  {info.display}
                </p>
              </div>
            ) : null}
          </AlertDialogBody>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={proceed}>
              <ExternalLink />
              Перейти
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
