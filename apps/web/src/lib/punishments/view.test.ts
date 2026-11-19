import { describe, expect, it } from 'vitest';

import { toPublicView } from './view';

const base = {
  ref: 'ban-1',
  kind: 'BAN',
  status: 'ACTIVE',
  startedAt: '2026-01-01T00:00:00.000Z',
  until: null,
  subjectName: 'Steve',
};

const FALLBACK = 'Нарушение правил';

describe('toPublicView reasonLabel', () => {
  it.each([
    ['reason отсутствует', {}],
    ['reason не объект', { reason: 'text' }],
    ['reason null', { reason: null }],
    ['label отсутствует', { reason: {} }],
    ['label null', { reason: { label: null } }],
    ['label пустой', { reason: { label: '' } }],
    ['label из пробелов', { reason: { label: '   ' } }],
  ])('%s -> запасная подпись', (_name, extra) => {
    expect(toPublicView({ ...base, ...extra })?.reasonLabel).toBe(FALLBACK);
  });

  it('непустой label не меняется', () => {
    expect(toPublicView({ ...base, reason: { label: ' Читы ' } })?.reasonLabel).toBe(' Читы ');
  });
});
