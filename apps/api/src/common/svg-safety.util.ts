/// Проверка пользовательского SVG (иконка плашки и т.п.).
///
/// Двойная защита: (1) здесь отклоняется всё активное и внешнее — скрипты,
/// обработчики событий, javascript:/data: URL, foreignObject/iframe/embed,
/// внешние ссылки href/src/url(), DOCTYPE/ENTITY; (2) на сайте такой SVG
/// показывается ТОЛЬКО через <img src="data:image/svg+xml,…">, где браузер
/// не исполняет скрипты и не грузит внешние ресурсы.

export const SVG_MAX_BYTES = 16 * 1024;

const FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<script/i, reason: 'скрипты' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'обработчики событий (on…)' },
  { pattern: /javascript\s*:/i, reason: 'javascript:-ссылки' },
  { pattern: /data\s*:/i, reason: 'встроенные data:-ресурсы' },
  { pattern: /<foreignObject/i, reason: 'foreignObject' },
  {
    pattern: /<(iframe|embed|object|image)\b/i,
    reason: 'вложенные документы и ссылки на ресурсы',
  },
  // Разрешены только внутренние ссылки на фрагменты: href="#id".
  {
    pattern: /href\s*=\s*(?:"(?!#)|'(?!#)|[^"'\s#])/i,
    reason: 'внешние ссылки',
  },
  { pattern: /\ssrc\s*=/i, reason: 'внешние ресурсы' },
  { pattern: /url\(\s*(?:"(?!#)|'(?!#)|[^"'\s#)])/i, reason: 'внешние url()' },
  { pattern: /@import/i, reason: '@import' },
  { pattern: /<!(DOCTYPE|ENTITY)/i, reason: 'DOCTYPE/ENTITY' },
];

export function svgProblems(svg: string): string[] {
  const problems: string[] = [];
  if (Buffer.byteLength(svg, 'utf8') > SVG_MAX_BYTES) {
    problems.push(`размер больше ${SVG_MAX_BYTES / 1024} КБ`);
  }
  const trimmed = svg.trim();
  if (
    !/^(<\?xml[^>]*\?>\s*)?<svg[\s>]/i.test(trimmed) ||
    !/<\/svg>\s*$/i.test(trimmed)
  ) {
    problems.push('это не SVG-документ (<svg>…</svg>)');
  }
  for (const rule of FORBIDDEN) {
    if (rule.pattern.test(trimmed)) {
      problems.push(rule.reason);
    }
  }
  return problems;
}
