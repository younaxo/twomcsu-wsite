'use client';

import { X } from 'lucide-react';
import {
  createContext,
  forwardRef,
  useContext,
  type ComponentPropsWithoutRef,
  type ElementRef,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import {
  Drawer as VaulDrawer,
  type DialogProps as VaulDialogProps,
  type WithFadeFromProps,
  type WithoutFadeFromProps,
} from 'vaul';
import { cn } from '@/lib/cn';
import { Button, IconButton } from './button';

/// Drawer — панель с жестами на vaul: снизу (mobile-замена dropdown/dialog)
/// или справа. Анимации появления/свайпа даёт сама библиотека.
/// `BottomSheet` — тот же Drawer снизу с опциональными snap-точками,
/// `ActionSheet` — список действий для замены context menu на touch.

export type DrawerDirection = 'bottom' | 'right';

const DrawerDirectionContext = createContext<DrawerDirection>('bottom');

/// Snap-часть vaul — объединение, поэтому `Omit` к ней не применяется
/// (схлопнул бы `fadeFromIndex?: never`); базу и snap складываем отдельно.
type DrawerBaseProps = Omit<VaulDialogProps, 'direction' | 'snapPoints' | 'fadeFromIndex'>;
type DrawerSnapProps = WithFadeFromProps | WithoutFadeFromProps;

export type DrawerProps = DrawerBaseProps & { direction?: DrawerDirection } & DrawerSnapProps;

export function Drawer({
  direction = 'bottom',
  shouldScaleBackground = false,
  children,
  ...props
}: DrawerProps) {
  return (
    <DrawerDirectionContext.Provider value={direction}>
      <VaulDrawer.Root
        direction={direction}
        shouldScaleBackground={shouldScaleBackground}
        {...props}
      >
        {children}
      </VaulDrawer.Root>
    </DrawerDirectionContext.Provider>
  );
}

export const DrawerTrigger = VaulDrawer.Trigger;
export const DrawerClose = VaulDrawer.Close;
export const DrawerPortal = VaulDrawer.Portal;

export const DrawerOverlay = forwardRef<
  ElementRef<typeof VaulDrawer.Overlay>,
  ComponentPropsWithoutRef<typeof VaulDrawer.Overlay>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Overlay
    ref={ref}
    className={cn('fixed inset-0 z-50 bg-foreground/40', className)}
    {...props}
  />
));
DrawerOverlay.displayName = 'DrawerOverlay';

/// Ручка сверху: цвет и размер переопределяют инлайн-стили vaul через
/// `data-[vaul-handle]` (выше специфичность, без `!important`).
export const DrawerHandle = forwardRef<
  ElementRef<typeof VaulDrawer.Handle>,
  ComponentPropsWithoutRef<typeof VaulDrawer.Handle>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Handle
    ref={ref}
    className={cn(
      'mb-2 mt-3 shrink-0 data-[vaul-handle]:h-1 data-[vaul-handle]:w-10 data-[vaul-handle]:rounded-full data-[vaul-handle]:bg-border-strong',
      className,
    )}
    {...props}
  />
));
DrawerHandle.displayName = 'DrawerHandle';

export interface DrawerContentProps extends ComponentPropsWithoutRef<typeof VaulDrawer.Content> {
  /// Крестик закрытия: по умолчанию только для `direction="right"`
  /// (снизу панель закрывается свайпом и ручкой).
  closeButton?: boolean;
  /// Скрыть ручку (когда контент сам управляет жестом, например карта).
  hideHandle?: boolean;
}

export const DrawerContent = forwardRef<ElementRef<typeof VaulDrawer.Content>, DrawerContentProps>(
  ({ className, closeButton, hideHandle = false, children, ...props }, ref) => {
    const direction = useContext(DrawerDirectionContext);
    const showClose = closeButton ?? direction === 'right';
    return (
      <DrawerPortal>
        <DrawerOverlay />
        <VaulDrawer.Content
          ref={ref}
          className={cn(
            'fixed z-50 flex flex-col bg-surface-overlay text-foreground shadow-lg edge-highlight',
            'overscroll-contain focus:outline-none',
            direction === 'bottom'
              ? 'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t pb-[env(safe-area-inset-bottom)]'
              : 'inset-y-0 right-0 h-dvh w-screen border-l pb-[env(safe-area-inset-bottom)] sm:w-[28rem] sm:rounded-l-lg',
            className,
          )}
          {...props}
        >
          {direction === 'bottom' && !hideHandle ? <DrawerHandle /> : null}
          {children}
          {showClose ? (
            <DrawerClose asChild>
              <IconButton aria-label="Закрыть" size="sm" className="absolute right-3 top-3">
                <X />
              </IconButton>
            </DrawerClose>
          ) : null}
        </VaulDrawer.Content>
      </DrawerPortal>
    );
  },
);
DrawerContent.displayName = 'DrawerContent';

export function DrawerHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'flex shrink-0 flex-col gap-1 px-card-p pb-3 pt-2 text-center sm:text-left',
        className,
      )}
      {...props}
    />
  );
}

/// Прокручиваемая часть; свайп внутри списка не закрывает панель.
export function DrawerBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'min-h-0 flex-1 overflow-y-auto overscroll-contain px-card-p pb-card-p scrollbar-thin',
        className,
      )}
      {...props}
    />
  );
}

export function DrawerFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('mt-auto flex shrink-0 flex-col gap-2 p-card-p pt-3', className)}
      {...props}
    />
  );
}

export const DrawerTitle = forwardRef<
  ElementRef<typeof VaulDrawer.Title>,
  ComponentPropsWithoutRef<typeof VaulDrawer.Title>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Title
    ref={ref}
    className={cn('font-display text-lg font-semibold leading-tight', className)}
    {...props}
  />
));
DrawerTitle.displayName = 'DrawerTitle';

export const DrawerDescription = forwardRef<
  ElementRef<typeof VaulDrawer.Description>,
  ComponentPropsWithoutRef<typeof VaulDrawer.Description>
>(({ className, ...props }, ref) => (
  <VaulDrawer.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DrawerDescription.displayName = 'DrawerDescription';

export type BottomSheetProps = DrawerBaseProps & DrawerSnapProps;

/// Нижняя панель: `snapPoints={[0.4, 1]}` — промежуточные высоты
/// (доли экрана или px-строки), `activeSnapPoint` — контролируемая текущая.
export function BottomSheet(props: BottomSheetProps) {
  return <Drawer direction="bottom" {...props} />;
}

export interface ActionSheetAction {
  label: ReactNode;
  icon?: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export type ActionSheetProps = Omit<DrawerBaseProps, 'children'> &
  DrawerSnapProps & {
    /// Заголовок контекста («Игрок Steve»). Без него остаётся скрытый
    /// заголовок для screen reader.
    title?: ReactNode;
    description?: ReactNode;
    /// Только доступные пользователю действия — фильтрацию по правам делает
    /// вызывающий код.
    actions: ActionSheetAction[];
    cancelLabel?: ReactNode;
  };

/// Mobile-замена dropdown/context menu: список действий во всю ширину
/// и кнопка «Отмена». Панель закрывается после выбора действия.
export function ActionSheet({
  title,
  description,
  actions,
  cancelLabel = 'Отмена',
  ...props
}: ActionSheetProps) {
  return (
    <BottomSheet {...props}>
      <DrawerContent {...(title || description ? {} : { 'aria-describedby': undefined })}>
        <DrawerHeader className={title || description ? undefined : 'sr-only'}>
          <DrawerTitle className="text-base">{title ?? 'Действия'}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <DrawerBody className="pb-0">
          <div className="flex flex-col gap-1" role="group" aria-label="Действия">
            {actions.map((action, index) => (
              <DrawerClose key={index} asChild>
                <Button
                  variant="ghost"
                  size="lg"
                  disabled={action.disabled}
                  onClick={action.onSelect}
                  className={cn(
                    'w-full justify-start',
                    action.destructive &&
                      'text-destructive hover:bg-destructive-soft hover:text-destructive',
                  )}
                >
                  {action.icon}
                  {action.label}
                </Button>
              </DrawerClose>
            ))}
          </div>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="secondary" size="lg" className="w-full">
              {cancelLabel}
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </BottomSheet>
  );
}
