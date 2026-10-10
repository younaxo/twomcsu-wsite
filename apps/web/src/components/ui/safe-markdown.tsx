import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

/// Безопасный Markdown для пользовательского текста (bio, ADR-0100) — свой
/// маленький разбор прямо в React-узлы: никакого HTML-строкового вывода и
/// `dangerouslySetInnerHTML`, поэтому `<script>`, `<iframe>`, `style`,
/// обработчики событий и любой сырой HTML остаются обычным текстом.
///
/// Поддержано: абзацы и переносы строк, **жирный**, *курсив* / _курсив_,
/// ~~зачёркнутый~~, `код`, [ссылки](https://…), голые https://-ссылки,
/// списки (`- `, `* `, `1. `), цитаты (`> `), экранирование `\*`.
/// Не поддержано намеренно: картинки (`![…](…)` — остаётся текстом),
/// заголовки (`#` — обычный текст, профиль не «ломается»), таблицы, HTML.
/// Ссылки — только http/https/mailto; переход на внешний сайт проходит через
/// глобальное подтверждение (ExternalLinkGuard). Вложенность форматирования —
/// не глубже `MAX_DEPTH`.

const MAX_DEPTH = 3;
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

/// URL ссылки или null, если протокол небезопасен (javascript:, data:, …).
export function safeHref(raw: string): string | null {
  const value = raw.trim();
  if (!value || /\s/.test(value)) return null;
  try {
    const url = new URL(value);
    if (!SAFE_PROTOCOLS.has(url.protocol)) return null;
    return url.href;
  } catch {
    return null;
  }
}

type InlineRule = {
  open: string;
  close: string;
  render: (children: ReactNode, key: string) => ReactNode;
};

const RULES: InlineRule[] = [
  { open: '**', close: '**', render: (c, k) => <strong key={k}>{c}</strong> },
  { open: '~~', close: '~~', render: (c, k) => <del key={k}>{c}</del> },
  { open: '*', close: '*', render: (c, k) => <em key={k}>{c}</em> },
  { open: '_', close: '_', render: (c, k) => <em key={k}>{c}</em> },
];

function link(label: ReactNode, href: string, key: string) {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="nofollow ugc noopener noreferrer"
      className="font-medium text-primary underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

/// Разбор строки в инлайн-узлы.
function inline(text: string, depth: number, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  let buffer = '';
  let i = 0;
  let n = 0;
  const key = () => `${keyPrefix}-${n++}`;
  const flush = () => {
    if (buffer) {
      out.push(buffer);
      buffer = '';
    }
  };

  while (i < text.length) {
    const rest = text.slice(i);
    const ch = text[i]!;

    // Экранирование: \* \_ \~ \` \[ \] \\ — символ как есть.
    if (ch === '\\' && i + 1 < text.length && /[\\*_~`[\]()>#!-]/.test(text[i + 1]!)) {
      buffer += text[i + 1];
      i += 2;
      continue;
    }

    // Код — без форматирования внутри.
    if (ch === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1) {
        flush();
        out.push(
          <code
            key={key()}
            className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]"
          >
            {text.slice(i + 1, end)}
          </code>,
        );
        i = end + 1;
        continue;
      }
    }

    // Картинка — не рисуется: остаётся текстом целиком.
    const image = /^!\[[^\]\n]*\]\([^)\n]*\)/.exec(rest);
    if (image) {
      buffer += image[0];
      i += image[0].length;
      continue;
    }

    // [текст](url)
    const md = /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(rest);
    if (md) {
      const href = safeHref(md[2]!);
      flush();
      const label = depth < MAX_DEPTH ? inline(md[1]!, depth + 1, key()) : md[1];
      out.push(href ? link(label, href, key()) : <Fragment key={key()}>{label}</Fragment>);
      i += md[0].length;
      continue;
    }

    // Голая ссылка https://… (только в начале слова).
    if ((ch === 'h' || ch === 'H') && (i === 0 || /\s|\(/.test(text[i - 1]!))) {
      const bare = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"»)]/i.exec(rest);
      if (bare) {
        const href = safeHref(bare[0]);
        if (href) {
          flush();
          out.push(link(bare[0], href, key()));
          i += bare[0].length;
          continue;
        }
      }
    }

    // **жирный**, ~~зачёркнутый~~, *курсив*, _курсив_.
    if (depth < MAX_DEPTH) {
      const rule = RULES.find((r) => rest.startsWith(r.open));
      if (rule) {
        const from = i + rule.open.length;
        const end = text.indexOf(rule.close, from);
        const inner = end > from ? text.slice(from, end) : '';
        // Пустые и «пробельные по краям» маркеры (`a * b`) — не разметка.
        if (
          inner &&
          !/^\s|\s$/.test(inner) &&
          !(rule.open === '_' && /\w/.test(text[i - 1] ?? ''))
        ) {
          flush();
          out.push(rule.render(inline(inner, depth + 1, key()), key()));
          i = end + rule.close.length;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }
  flush();
  return out;
}

/// Строки абзаца/цитаты — с переносами, как в исходном тексте.
function lines(items: string[], keyPrefix: string): ReactNode[] {
  return items.flatMap((line, index) => [
    ...(index > 0 ? [<br key={`${keyPrefix}-br-${index}`} />] : []),
    <Fragment key={`${keyPrefix}-l-${index}`}>{inline(line, 1, `${keyPrefix}-${index}`)}</Fragment>,
  ]);
}

type Block =
  | { kind: 'p'; lines: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'ul' | 'ol'; items: string[] };

const UL = /^\s*[-*+]\s+(.*)$/;
const OL = /^\s*\d{1,3}[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;

export function parseBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const push = (kind: Block['kind'], value: string) => {
    const last = blocks.at(-1);
    if (kind === 'ul' || kind === 'ol') {
      if (last && last.kind === kind) last.items.push(value);
      else blocks.push({ kind, items: [value] });
    } else if (last && last.kind === kind) {
      last.lines.push(value);
    } else {
      blocks.push({ kind, lines: [value] } as Block);
    }
  };
  let separated = true;
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) {
      separated = true;
      continue;
    }
    const ul = UL.exec(line);
    const ol = OL.exec(line);
    const quote = QUOTE.exec(line);
    if (ul) push('ul', ul[1]!);
    else if (ol) push('ol', ol[1]!);
    else if (quote) push('quote', quote[1]!);
    else if (!separated && blocks.at(-1)?.kind === 'p') push('p', line);
    else blocks.push({ kind: 'p', lines: [line] });
    separated = false;
  }
  return blocks;
}

export function SafeMarkdown({ source, className }: { source: string; className?: string }) {
  const blocks = parseBlocks(source);
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 break-words text-sm [overflow-wrap:anywhere]',
        className,
      )}
      data-testid="safe-markdown"
    >
      {blocks.map((block, index) => {
        const key = `b${index}`;
        if ('items' in block) {
          const List = block.kind;
          return (
            <List
              key={key}
              className={cn(
                'flex flex-col gap-1 pl-5',
                block.kind === 'ul' ? 'list-disc' : 'list-decimal',
              )}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`}>{inline(item, 1, `${key}-${itemIndex}`)}</li>
              ))}
            </List>
          );
        }
        if (block.kind === 'quote') {
          return (
            <blockquote
              key={key}
              className="border-l-2 border-border-strong pl-3 text-muted-foreground"
            >
              {lines(block.lines, key)}
            </blockquote>
          );
        }
        return <p key={key}>{lines(block.lines, key)}</p>;
      })}
    </div>
  );
}
