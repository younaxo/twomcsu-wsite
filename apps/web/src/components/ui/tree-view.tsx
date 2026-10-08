'use client';

import { ChevronRight } from 'lucide-react';
import {
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/cn';

export interface TreeNode {
  id: string;
  label: ReactNode;
  icon?: ReactNode;
  children?: TreeNode[];
  disabled?: boolean;
}

export interface TreeViewProps extends Omit<HTMLAttributes<HTMLUListElement>, 'onSelect'> {
  nodes: TreeNode[];
  /// Раскрытые ветки. Без пропа — внутреннее состояние (см. `defaultExpandAll`).
  expanded?: Set<string>;
  onExpandedChange?: (next: Set<string>) => void;
  defaultExpandAll?: boolean;
  selected?: string | null;
  onSelect?: (id: string) => void;
  /// Доступное имя дерева.
  label?: string;
}

interface FlatNode {
  node: TreeNode;
  depth: number;
  parentId: string | null;
}

function collectBranchIds(nodes: TreeNode[], acc = new Set<string>()): Set<string> {
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      acc.add(node.id);
      collectBranchIds(node.children, acc);
    }
  }
  return acc;
}

/// Видимые узлы в порядке обхода — по ним ходят стрелки/Home/End.
function flattenVisible(
  nodes: TreeNode[],
  expanded: Set<string>,
  depth = 0,
  parentId: string | null = null,
  acc: FlatNode[] = [],
): FlatNode[] {
  for (const node of nodes) {
    acc.push({ node, depth, parentId });
    if (node.children && node.children.length > 0 && expanded.has(node.id)) {
      flattenVisible(node.children, expanded, depth + 1, node.id, acc);
    }
  }
  return acc;
}

const INDENT_PX = 16;

/// Дерево (категории, файлы ресурс-пака, структура прав). Roving tabindex:
/// один tab-stop на дерево, внутри — стрелки, Home/End, Enter.
export function TreeView({
  nodes,
  expanded: expandedProp,
  onExpandedChange,
  defaultExpandAll = false,
  selected = null,
  onSelect,
  label = 'Дерево',
  className,
  ...props
}: TreeViewProps) {
  const [internalExpanded, setInternalExpanded] = useState<Set<string>>(() =>
    defaultExpandAll ? collectBranchIds(nodes) : new Set(),
  );
  const expanded = expandedProp ?? internalExpanded;
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const itemRefs = useRef(new Map<string, HTMLLIElement>());

  const visible = useMemo(() => flattenVisible(nodes, expanded), [nodes, expanded]);
  const visibleIds = visible.map((item) => item.node.id);
  const tabStopId =
    focusedId && visibleIds.includes(focusedId)
      ? focusedId
      : selected && visibleIds.includes(selected)
        ? selected
        : (visibleIds[0] ?? null);

  const setExpanded = (next: Set<string>) => {
    if (expandedProp === undefined) {
      setInternalExpanded(next);
    }
    onExpandedChange?.(next);
  };

  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setExpanded(next);
  };

  const focusNode = (id: string) => {
    setFocusedId(id);
    itemRefs.current.get(id)?.focus();
  };

  const activate = (node: TreeNode) => {
    if (node.disabled) {
      return;
    }
    if (onSelect) {
      onSelect(node.id);
    } else if (node.children && node.children.length > 0) {
      toggle(node.id);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLLIElement>, flat: FlatNode) => {
    // События детей всплывают через родительские treeitem — реагируем только на свой.
    if (event.target !== event.currentTarget) {
      return;
    }
    const index = visible.findIndex((item) => item.node.id === flat.node.id);
    const hasChildren = !!flat.node.children && flat.node.children.length > 0;
    const isExpanded = hasChildren && expanded.has(flat.node.id);
    let handled = true;
    switch (event.key) {
      case 'ArrowDown': {
        const next = visible[Math.min(index + 1, visible.length - 1)];
        if (next) {
          focusNode(next.node.id);
        }
        break;
      }
      case 'ArrowUp': {
        const prev = visible[Math.max(index - 1, 0)];
        if (prev) {
          focusNode(prev.node.id);
        }
        break;
      }
      case 'ArrowRight': {
        if (hasChildren && !isExpanded) {
          toggle(flat.node.id);
        } else if (isExpanded) {
          const child = visible[index + 1];
          if (child) {
            focusNode(child.node.id);
          }
        }
        break;
      }
      case 'ArrowLeft': {
        if (isExpanded) {
          toggle(flat.node.id);
        } else if (flat.parentId) {
          focusNode(flat.parentId);
        }
        break;
      }
      case 'Home': {
        const first = visible[0];
        if (first) {
          focusNode(first.node.id);
        }
        break;
      }
      case 'End': {
        const last = visible[visible.length - 1];
        if (last) {
          focusNode(last.node.id);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        activate(flat.node);
        break;
      }
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  const renderNodes = (list: TreeNode[], depth: number, parentId: string | null): ReactNode =>
    list.map((node) => {
      const children = node.children ?? [];
      const hasChildren = children.length > 0;
      const isExpanded = hasChildren && expanded.has(node.id);
      const isSelected = selected === node.id;
      return (
        <li
          key={node.id}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={onSelect ? isSelected : undefined}
          aria-disabled={node.disabled || undefined}
          aria-level={depth + 1}
          tabIndex={tabStopId === node.id ? 0 : -1}
          ref={(element) => {
            if (element) {
              itemRefs.current.set(node.id, element);
            } else {
              itemRefs.current.delete(node.id);
            }
          }}
          onKeyDown={(event) => handleKeyDown(event, { node, depth, parentId })}
          onFocus={(event) => {
            if (event.target === event.currentTarget) {
              setFocusedId(node.id);
            }
          }}
          // Outline переносим с <li> (обёртка всего поддерева) на строку узла.
          className="outline-none [&:focus-visible>div]:ring-2 [&:focus-visible>div]:ring-ring"
        >
          <div
            onClick={(event) => {
              event.stopPropagation();
              if (node.disabled) {
                return;
              }
              focusNode(node.id);
              activate(node);
            }}
            style={{ paddingInlineStart: depth * INDENT_PX + 8 }}
            className={cn(
              'flex h-8 select-none items-center gap-1.5 rounded-sm pr-2 text-sm transition-colors duration-fast',
              'hover:bg-muted',
              isSelected && 'bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft',
              node.disabled && 'cursor-not-allowed opacity-50 hover:bg-transparent',
            )}
          >
            {hasChildren ? (
              <span
                aria-hidden
                onClick={(event) => {
                  event.stopPropagation();
                  if (!node.disabled) {
                    toggle(node.id);
                  }
                }}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-sm text-subtle-foreground hover:bg-surface-sunken hover:text-foreground"
              >
                <ChevronRight
                  className={cn(
                    'size-4 transition-transform duration-fast',
                    isExpanded && 'rotate-90',
                  )}
                />
              </span>
            ) : (
              <span aria-hidden className="size-5 shrink-0" />
            )}
            {node.icon ? (
              <span
                aria-hidden
                className="inline-flex shrink-0 text-muted-foreground [&_svg]:size-4"
              >
                {node.icon}
              </span>
            ) : null}
            <span className="min-w-0 truncate">{node.label}</span>
          </div>
          {isExpanded ? <ul role="group">{renderNodes(children, depth + 1, node.id)}</ul> : null}
        </li>
      );
    });

  return (
    <ul
      role="tree"
      aria-label={label}
      className={cn('flex flex-col gap-0.5 text-foreground', className)}
      {...props}
    >
      {renderNodes(nodes, 0, null)}
    </ul>
  );
}
