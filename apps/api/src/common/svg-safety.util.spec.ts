import { svgProblems } from './svg-safety.util';

describe('svgProblems', () => {
  const ok =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="g"/></defs>' +
    '<path id="p" fill="url(#g)" d="M0 0h24v24H0z"/><use href="#p"/></svg>';

  it('пропускает обычный SVG с внутренними ссылками', () => {
    expect(svgProblems(ok)).toEqual([]);
  });

  it.each([
    ['<svg><script>alert(1)</script></svg>', 'скрипты'],
    ['<svg onload="alert(1)"></svg>', 'обработчики событий (on…)'],
    ['<svg><a href="javascript:alert(1)">x</a></svg>', 'javascript:-ссылки'],
    ['<svg><use href="https://evil.example/x.svg#a"/></svg>', 'внешние ссылки'],
    [
      '<svg><image href="#a"/></svg>',
      'вложенные документы и ссылки на ресурсы',
    ],
    ['<svg><foreignObject/></svg>', 'foreignObject'],
    ['<svg style="background:url(\'https://x\')"></svg>', 'внешние url()'],
    ['<!DOCTYPE svg><svg></svg>', 'DOCTYPE/ENTITY'],
    ['<div>not svg</div>', 'это не SVG-документ (<svg>…</svg>)'],
  ])('отклоняет %s', (svg, reason) => {
    expect(svgProblems(svg)).toContain(reason);
  });
});
