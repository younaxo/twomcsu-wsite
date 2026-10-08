'use client';

import {
  Children,
  createContext,
  forwardRef,
  isValidElement,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from '@/lib/cn';
import { useIsMobile } from '@/lib/use-media-query';

/// Resizable — прототип split-панелей на pointer events без зависимостей.
/// Размеры в процентах, соседние панели делят дельту между собой.
/// Ручка: `role="separator"` + стрелки (±2%, Shift — ±10%), Home/End.

export type ResizableDirection = 'horizontal' | 'vertical';

export interface ResizablePanelProps extends HTMLAttributes<HTMLDivElement> {
  /// Начальный размер в % от группы; без него остаток делится поровну.
  defaultSize?: number;
  minSize?: number;
  maxSize?: number;
}

interface PanelLimits {
  min: number;
  max: number;
}

interface GroupContextValue {
  direction: ResizableDirection;
  sizes: number[];
  limits: PanelLimits[];
  groupRef: RefObject<HTMLDivElement>;
  resizePair: (handleIndex: number, startA: number, startB: number, delta: number) => void;
}

const GroupContext = createContext<GroupContextValue | null>(null);
const PanelIndexContext = createContext<number>(-1);
const HandleIndexContext = createContext<number>(-1);

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/// Во время перетаскивания текст не должен выделяться, курсор — единый.
function useBodyDragStyles(dragging: boolean, cursor: string) {
  useEffect(() => {
    if (!dragging) {
      return;
    }
    const previousSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = cursor;
    return () => {
      document.body.style.userSelect = previousSelect;
      document.body.style.cursor = previousCursor;
    };
  }, [dragging, cursor]);
}

function isPanelElement(child: unknown): child is ReactElement<ResizablePanelProps> {
  return isValidElement(child) && child.type === ResizablePanel;
}

function initialSizes(panels: ResizablePanelProps[]): number[] {
  const assigned = panels.reduce((sum, panel) => sum + (panel.defaultSize ?? 0), 0);
  const unassigned = panels.filter((panel) => panel.defaultSize === undefined).length;
  const rest = unassigned > 0 ? Math.max(0, 100 - assigned) / unassigned : 0;
  return panels.map((panel) => panel.defaultSize ?? rest);
}

export interface ResizablePanelGroupProps extends HTMLAttributes<HTMLDivElement> {
  direction?: ResizableDirection;
  children: ReactNode;
}

export const ResizablePanelGroup = forwardRef<HTMLDivElement, ResizablePanelGroupProps>(
  ({ direction = 'horizontal', className, children, ...props }, ref) => {
    const groupRef = useRef<HTMLDivElement | null>(null);
    const panelProps = useMemo(
      () =>
        Children.toArray(children)
          .filter(isPanelElement)
          .map((element) => element.props),
      [children],
    );
    const limits = useMemo<PanelLimits[]>(
      () => panelProps.map((panel) => ({ min: panel.minSize ?? 10, max: panel.maxSize ?? 90 })),
      [panelProps],
    );
    const [sizesState, setSizes] = useState<number[] | null>(null);
    const sizes =
      sizesState && sizesState.length === panelProps.length ? sizesState : initialSizes(panelProps);

    const resizePair = (handleIndex: number, startA: number, startB: number, delta: number) => {
      const a = limits[handleIndex];
      const b = limits[handleIndex + 1];
      if (!a || !b) {
        return;
      }
      const sum = startA + startB;
      let nextA = clamp(startA + delta, a.min, Math.min(a.max, sum - b.min));
      let nextB = sum - nextA;
      if (nextB > b.max) {
        nextB = b.max;
        nextA = sum - nextB;
      }
      setSizes((previous) => {
        const next = [...(previous && previous.length === limits.length ? previous : sizes)];
        next[handleIndex] = nextA;
        next[handleIndex + 1] = nextB;
        return next;
      });
    };

    // Индексы панелей/ручек по порядку детей — без клонирования элементов.
    let panelIndex = 0;
    const mapped = Children.map(children, (child) => {
      if (!isValidElement(child)) {
        return child;
      }
      if (child.type === ResizablePanel) {
        const index = panelIndex;
        panelIndex += 1;
        return <PanelIndexContext.Provider value={index}>{child}</PanelIndexContext.Provider>;
      }
      if (child.type === ResizableHandle) {
        return (
          <HandleIndexContext.Provider value={panelIndex - 1}>{child}</HandleIndexContext.Provider>
        );
      }
      return child;
    });

    return (
      <GroupContext.Provider value={{ direction, sizes, limits, groupRef, resizePair }}>
        <div
          ref={(node) => {
            groupRef.current = node;
            if (typeof ref === 'function') {
              ref(node);
            } else if (ref) {
              ref.current = node;
            }
          }}
          data-direction={direction}
          className={cn(
            'flex h-full w-full min-w-0',
            direction === 'horizontal' ? 'flex-row' : 'flex-col',
            className,
          )}
          {...props}
        >
          {mapped}
        </div>
      </GroupContext.Provider>
    );
  },
);
ResizablePanelGroup.displayName = 'ResizablePanelGroup';

export const ResizablePanel = forwardRef<HTMLDivElement, ResizablePanelProps>(
  ({ className, style, defaultSize, minSize = 10, maxSize = 90, ...props }, ref) => {
    const group = useContext(GroupContext);
    const index = useContext(PanelIndexContext);
    const size = group?.sizes[index] ?? defaultSize ?? 100;
    const horizontal = group?.direction !== 'vertical';
    return (
      <div
        ref={ref}
        data-panel-index={index}
        className={cn('min-h-0 min-w-0 overflow-auto', className)}
        // flex-grow пропорционален размеру: ручки занимают свои px, панели — остальное.
        // min/max в CSS — страховка, основное ограничение считает группа.
        style={{
          flex: `${size} 1 0px`,
          [horizontal ? 'minWidth' : 'minHeight']: `${minSize}%`,
          [horizontal ? 'maxWidth' : 'maxHeight']: `${maxSize}%`,
          ...style,
        }}
        {...props}
      />
    );
  },
);
ResizablePanel.displayName = 'ResizablePanel';

export interface ResizableHandleProps extends HTMLAttributes<HTMLDivElement> {
  /// Доступное имя ручки.
  label?: string;
}

const handleBaseClassName = cn(
  'relative shrink-0 touch-none bg-border transition-colors duration-fast',
  'hover:bg-primary focus-visible:bg-primary data-[dragging]:bg-primary',
  // Невидимая зона захвата 8px вокруг линии в 1px (content подставляет вариант after:).
  'after:absolute',
);

export const ResizableHandle = forwardRef<HTMLDivElement, ResizableHandleProps>(
  ({ className, label = 'Изменить размер панели', ...props }, ref) => {
    const group = useContext(GroupContext);
    const handleIndex = useContext(HandleIndexContext);
    const [dragging, setDragging] = useState(false);
    const startRef = useRef<{ position: number; a: number; b: number; total: number } | null>(null);
    const horizontal = group?.direction !== 'vertical';
    useBodyDragStyles(dragging, horizontal ? 'col-resize' : 'row-resize');

    if (!group || handleIndex < 0) {
      return null;
    }
    const sizeA = group.sizes[handleIndex] ?? 0;
    const sizeB = group.sizes[handleIndex + 1] ?? 0;
    const limitsA = group.limits[handleIndex] ?? { min: 0, max: 100 };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      const rect = group.groupRef.current?.getBoundingClientRect();
      const total = horizontal ? rect?.width : rect?.height;
      if (!total) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      startRef.current = {
        position: horizontal ? event.clientX : event.clientY,
        a: sizeA,
        b: sizeB,
        total,
      };
      setDragging(true);
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) {
        return;
      }
      const current = horizontal ? event.clientX : event.clientY;
      const delta = ((current - start.position) / start.total) * 100;
      group.resizePair(handleIndex, start.a, start.b, delta);
    };

    const endDrag = () => {
      startRef.current = null;
      setDragging(false);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 10 : 2;
      const decrease = horizontal ? 'ArrowLeft' : 'ArrowUp';
      const increase = horizontal ? 'ArrowRight' : 'ArrowDown';
      let delta: number | null = null;
      if (event.key === decrease) {
        delta = -step;
      } else if (event.key === increase) {
        delta = step;
      } else if (event.key === 'Home') {
        delta = limitsA.min - sizeA;
      } else if (event.key === 'End') {
        delta = limitsA.max - sizeA;
      }
      if (delta === null) {
        return;
      }
      event.preventDefault();
      group.resizePair(handleIndex, sizeA, sizeB, delta);
    };

    return (
      <div
        ref={ref}
        role="separator"
        tabIndex={0}
        aria-label={label}
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(sizeA)}
        aria-valuemin={Math.round(limitsA.min)}
        aria-valuemax={Math.round(limitsA.max)}
        data-dragging={dragging || undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        className={cn(
          handleBaseClassName,
          horizontal
            ? 'w-px cursor-col-resize after:inset-y-0 after:-left-1 after:w-2'
            : 'h-px cursor-row-resize after:inset-x-0 after:-top-1 after:h-2',
          className,
        )}
        {...props}
      />
    );
  },
);
ResizableHandle.displayName = 'ResizableHandle';

const STORAGE_PREFIX = 'twomc:sidebar-width:v1:';

function readStoredWidth(key: string): number | null {
  try {
    const raw = window.localStorage.getItem(key);
    const value = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(value) ? value : null;
  } catch {
    // Приватный режим / запрет storage — используем значение по умолчанию.
    return null;
  }
}

function writeStoredWidth(key: string, width: number) {
  try {
    window.localStorage.setItem(key, String(Math.round(width)));
  } catch {
    // Квота или запрет storage — ширина живёт только в сессии.
  }
}

export interface ResizableSidebarProps extends HTMLAttributes<HTMLDivElement> {
  /// Содержимое сайдбара.
  sidebar: ReactNode;
  /// Основная область.
  children: ReactNode;
  defaultWidth?: number;
  minWidth?: number;
  maxWidth?: number;
  /// Ключ localStorage (версионируется внутри); без него ширина не сохраняется.
  storageKey?: string;
  collapsed?: boolean;
  sidebarClassName?: string;
}

/// Сайдбар с перетаскиваемым правым краем (px). На mobile — обычный блок
/// сверху без ручки. Ширина запоминается в localStorage.
export const ResizableSidebar = forwardRef<HTMLDivElement, ResizableSidebarProps>(
  (
    {
      sidebar,
      children,
      defaultWidth = 260,
      minWidth = 200,
      maxWidth = 400,
      storageKey,
      collapsed = false,
      sidebarClassName,
      className,
      ...props
    },
    ref,
  ) => {
    const isMobile = useIsMobile();
    const [width, setWidth] = useState(defaultWidth);
    const [dragging, setDragging] = useState(false);
    const startRef = useRef<{ x: number; width: number } | null>(null);
    const key = storageKey ? `${STORAGE_PREFIX}${storageKey}` : null;
    useBodyDragStyles(dragging, 'col-resize');

    // Чтение после монтирования — на сервере storage нет, иначе hydration mismatch.
    useEffect(() => {
      if (!key) {
        return;
      }
      const stored = readStoredWidth(key);
      if (stored !== null) {
        setWidth(clamp(stored, minWidth, maxWidth));
      }
    }, [key, minWidth, maxWidth]);

    const commit = (next: number) => {
      const clamped = clamp(next, minWidth, maxWidth);
      setWidth(clamped);
      if (key) {
        writeStoredWidth(key, clamped);
      }
    };

    const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) {
        return;
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      startRef.current = { x: event.clientX, width };
      setDragging(true);
    };

    const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) {
        return;
      }
      setWidth(clamp(start.width + (event.clientX - start.x), minWidth, maxWidth));
    };

    const endDrag = () => {
      if (!startRef.current) {
        return;
      }
      startRef.current = null;
      setDragging(false);
      commit(width);
    };

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 64 : 16;
      let next: number | null = null;
      if (event.key === 'ArrowLeft') {
        next = width - step;
      } else if (event.key === 'ArrowRight') {
        next = width + step;
      } else if (event.key === 'Home') {
        next = minWidth;
      } else if (event.key === 'End') {
        next = maxWidth;
      }
      if (next === null) {
        return;
      }
      event.preventDefault();
      commit(next);
    };

    return (
      <div
        ref={ref}
        className={cn('flex min-h-0 w-full', isMobile ? 'flex-col' : 'flex-row', className)}
        {...props}
      >
        <aside
          hidden={collapsed}
          className={cn(
            'relative shrink-0 overflow-hidden',
            !isMobile && 'min-w-0',
            sidebarClassName,
          )}
          style={isMobile ? undefined : { width }}
        >
          {sidebar}
        </aside>
        {isMobile ? null : (
          <div
            hidden={collapsed}
            role="separator"
            tabIndex={0}
            aria-label="Изменить ширину сайдбара"
            aria-orientation="vertical"
            aria-valuenow={Math.round(width)}
            aria-valuemin={minWidth}
            aria-valuemax={maxWidth}
            data-dragging={dragging || undefined}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onLostPointerCapture={endDrag}
            onKeyDown={onKeyDown}
            className={cn(
              handleBaseClassName,
              'w-px cursor-col-resize after:inset-y-0 after:-left-1 after:w-2',
            )}
          />
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    );
  },
);
ResizableSidebar.displayName = 'ResizableSidebar';
