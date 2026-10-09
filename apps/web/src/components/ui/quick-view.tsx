'use client';

import { ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/use-media-query';
import { Button } from './button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from './drawer';

export interface QuickViewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Имя объекта: ник игрока, название роли, номер заказа.
  title: ReactNode;
  /// Тип/контекст под заголовком («Игрок · регистрация 12.03.2024»).
  subtitle?: ReactNode;
  /// Бейджи и короткие факты в строку (StatusBadge, Badge, счётчики).
  meta?: ReactNode;
  /// Боковая колонка: справа на desktop, под основным контентом на mobile.
  aside?: ReactNode;
  /// Кнопки действий в футере (Button).
  actions?: ReactNode;
  /// Ссылка на полную страницу объекта — «Открыть страницу».
  href?: string;
  hrefLabel?: ReactNode;
  children: ReactNode;
  className?: string;
}

/// QuickView — быстрый просмотр объекта без перехода со страницы списка.
/// На desktop — `Dialog` (lg), на mobile (< 768px) — нижний `Drawer`.
/// Первый рендер на сервере считает экран desktop; переключение происходит
/// на клиенте до того, как overlay открыт пользователем.
export function QuickView({
  open,
  onOpenChange,
  title,
  subtitle,
  meta,
  aside,
  actions,
  href,
  hrefLabel = 'Открыть страницу',
  children,
  className,
}: QuickViewProps) {
  const mobile = useIsMobile();

  const metaRow = meta ? (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {meta}
    </div>
  ) : null;

  const body = (
    <div className={cn(aside && 'grid gap-gap sm:grid-cols-[minmax(0,1fr)_16rem]')}>
      <div className="min-w-0">{children}</div>
      {aside ? (
        <aside className="min-w-0 border-t border-border-subtle pt-4 sm:border-l sm:border-t-0 sm:pl-gap sm:pt-0">
          {aside}
        </aside>
      ) : null}
    </div>
  );

  const hasFooter = Boolean(href || actions);
  const footer = hasFooter ? (
    <>
      {href ? (
        <Button asChild variant="link" className="sm:mr-auto">
          <Link href={href}>
            {hrefLabel}
            <ArrowUpRight aria-hidden />
          </Link>
        </Button>
      ) : null}
      {actions}
    </>
  ) : null;

  // Без подзаголовка Radix ждёт явного aria-describedby={undefined}.
  const describedBy = subtitle ? {} : { 'aria-describedby': undefined };

  if (mobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className={className} {...describedBy}>
          <DrawerHeader className="text-left">
            <DrawerTitle>{title}</DrawerTitle>
            {subtitle ? <DrawerDescription>{subtitle}</DrawerDescription> : null}
            {metaRow}
          </DrawerHeader>
          <DrawerBody>{body}</DrawerBody>
          {footer ? (
            <DrawerFooter className="border-t border-border-subtle">{footer}</DrawerFooter>
          ) : null}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        // Центрирование через `translate`: keyframes pop-in переопределяют `transform`.
        className={cn('translate-x-0 translate-y-0 [translate:-50%_-50%]', className)}
        {...describedBy}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {subtitle ? <DialogDescription>{subtitle}</DialogDescription> : null}
          {metaRow}
        </DialogHeader>
        <DialogBody>{body}</DialogBody>
        {footer ? <DialogFooter>{footer}</DialogFooter> : null}
      </DialogContent>
    </Dialog>
  );
}
