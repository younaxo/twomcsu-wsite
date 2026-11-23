import { describe, expect, it } from 'vitest';
import robots from './robots';

describe('robots.txt', () => {
  it('закрывает /bans от индексации', () => {
    const rules = robots().rules;
    const first = Array.isArray(rules) ? rules[0] : rules;
    expect(first?.disallow).toContain('/bans');
  });
});
