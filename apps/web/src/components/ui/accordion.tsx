'use client';

import { ChevronDown } from 'lucide-react';
import { Accordion as RadixAccordion } from 'radix-ui';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from 'react';
import { cn } from '@/lib/cn';

/// Accordion — раскрывающиеся секции (FAQ, настройки, детали заказа).
/// `type="single" collapsible` — одна открытая секция, `type="multiple"` — любые.
///
/// Анимация высоты без keyframes: контент всегда смонтирован (`forceMount`),
/// обёртка — grid с `grid-template-rows: 0fr → 1fr` (transition), внутри
/// `min-h-0 overflow-hidden`. В закрытом состоянии `visibility: hidden`
/// (visibility в transition — переключается по окончании сворачивания),
/// поэтому скрытый контент выпадает из tab-порядка и дерева доступности.

export const Accordion = RadixAccordion.Root;

export const AccordionItem = forwardRef<
  ElementRef<typeof RadixAccordion.Item>,
  ComponentPropsWithoutRef<typeof RadixAccordion.Item>
>(({ className, ...props }, ref) => (
  <RadixAccordion.Item ref={ref} className={cn('border-b border-border', className)} {...props} />
));
AccordionItem.displayName = 'AccordionItem';

export const AccordionTrigger = forwardRef<
  ElementRef<typeof RadixAccordion.Trigger>,
  ComponentPropsWithoutRef<typeof RadixAccordion.Trigger>
>(({ className, children, ...props }, ref) => (
  <RadixAccordion.Header className="flex">
    <RadixAccordion.Trigger
      ref={ref}
      className={cn(
        'group/trigger flex min-h-row flex-1 items-center justify-between gap-3 rounded-sm px-2 py-2 text-left text-sm font-medium text-foreground',
        'transition-[background-color] duration-fast hover:bg-muted/50',
        'disabled:pointer-events-none disabled:opacity-50',
        '[&_svg]:size-4 [&_svg]:shrink-0',
        className,
      )}
      {...props}
    >
      {children}
      <ChevronDown
        aria-hidden
        className="text-subtle-foreground transition-transform group-data-[state=open]/trigger:rotate-180"
      />
    </RadixAccordion.Trigger>
  </RadixAccordion.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionContent = forwardRef<
  ElementRef<typeof RadixAccordion.Content>,
  ComponentPropsWithoutRef<typeof RadixAccordion.Content>
>(({ className, children, ...props }, ref) => (
  <RadixAccordion.Content
    ref={ref}
    forceMount
    className={cn(
      'grid transition-[grid-template-rows,visibility] ease-out',
      'data-[state=open]:grid-rows-[1fr] data-[state=closed]:invisible data-[state=closed]:grid-rows-[0fr]',
    )}
    {...props}
  >
    <div className="min-h-0 overflow-hidden">
      <div className={cn('px-2 pb-4 text-sm text-muted-foreground', className)}>{children}</div>
    </div>
  </RadixAccordion.Content>
));
AccordionContent.displayName = 'AccordionContent';
