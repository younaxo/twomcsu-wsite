'use client';

import { Tabs as RadixTabs } from 'radix-ui';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';
import { Badge } from './badge';

/// Tabs — переключение разделов контента (Radix). `line` — подчёркивание у
/// активной вкладки (страницы, карточки сущностей); `enclosed` — «утопленный»
/// переключатель как SegmentedControl (внутренние режимы внутри панели).
/// На mobile список прокручивается горизонтально.

export type TabsVariant = 'line' | 'enclosed';

const TabsVariantContext = createContext<TabsVariant>('line');

export interface TabsProps extends ComponentPropsWithoutRef<typeof RadixTabs.Root> {
  variant?: TabsVariant;
}

export const Tabs = forwardRef<ElementRef<typeof RadixTabs.Root>, TabsProps>(
  ({ variant = 'line', className, ...props }, ref) => (
    <TabsVariantContext.Provider value={variant}>
      <RadixTabs.Root
        ref={ref}
        className={cn('flex flex-col gap-gap data-[orientation=vertical]:flex-row', className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  ),
);
Tabs.displayName = 'Tabs';

export const TabsList = forwardRef<
  ElementRef<typeof RadixTabs.List>,
  ComponentPropsWithoutRef<typeof RadixTabs.List>
>(({ className, ...props }, ref) => {
  const variant = useContext(TabsVariantContext);
  return (
    <RadixTabs.List
      ref={ref}
      className={cn(
        'flex max-w-full shrink-0 items-center overflow-x-auto whitespace-nowrap scrollbar-thin',
        'data-[orientation=vertical]:flex-col data-[orientation=vertical]:items-stretch data-[orientation=vertical]:overflow-x-visible',
        variant === 'line' &&
          'gap-1 border-b border-border data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:border-r',
        variant === 'enclosed' && 'w-fit gap-0.5 rounded bg-surface-sunken p-0.5',
        className,
      )}
      {...props}
    />
  );
});
TabsList.displayName = 'TabsList';

export interface TabsTriggerProps extends ComponentPropsWithoutRef<typeof RadixTabs.Trigger> {
  icon?: ReactNode;
  /// Счётчик справа от подписи (непрочитанные, количество записей).
  count?: number | string;
}

export const TabsTrigger = forwardRef<ElementRef<typeof RadixTabs.Trigger>, TabsTriggerProps>(
  ({ className, icon, count, children, ...props }, ref) => {
    const variant = useContext(TabsVariantContext);
    return (
      <RadixTabs.Trigger
        ref={ref}
        className={cn(
          'group/tab inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-medium text-muted-foreground',
          'transition-[color,background-color,border-color,box-shadow] duration-fast',
          'hover:text-foreground focus-visible:-outline-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          '[&_svg]:size-4 [&_svg]:shrink-0',
          variant === 'line' && [
            'h-control border-b-2 border-transparent px-3 text-sm',
            'data-[state=active]:border-primary data-[state=active]:text-foreground',
            'data-[orientation=vertical]:justify-start data-[orientation=vertical]:border-b-0 data-[orientation=vertical]:border-r-2',
          ],
          variant === 'enclosed' && [
            'h-control-sm rounded-sm px-3 text-sm',
            'data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm',
          ],
          className,
        )}
        {...props}
      >
        {icon ? (
          <span aria-hidden className="inline-flex">
            {icon}
          </span>
        ) : null}
        {children}
        {count !== undefined ? (
          <Badge
            tone="neutral"
            className={cn(
              'tabular',
              'group-data-[state=active]/tab:border-transparent group-data-[state=active]/tab:bg-primary-soft group-data-[state=active]/tab:text-primary-soft-foreground',
            )}
          >
            {count}
          </Badge>
        ) : null}
      </RadixTabs.Trigger>
    );
  },
);
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = forwardRef<
  ElementRef<typeof RadixTabs.Content>,
  ComponentPropsWithoutRef<typeof RadixTabs.Content>
>(({ className, ...props }, ref) => (
  <RadixTabs.Content ref={ref} className={cn('min-w-0 flex-1 rounded', className)} {...props} />
));
TabsContent.displayName = 'TabsContent';
