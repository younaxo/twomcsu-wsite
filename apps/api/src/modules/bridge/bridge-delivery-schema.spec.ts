import { parseAckBody, parseClaimBody } from './bridge-delivery-schema';

const TOKEN = '123e4567-e89b-12d3-a456-426614174000';
const item = (over: Record<string, unknown> = {}) => ({
  jobId: 'job_12345678',
  claimToken: TOKEN,
  status: 'done',
  ...over,
});

describe('parseClaimBody (0.13)', () => {
  it('пустое тело даёт max по умолчанию', () => {
    expect(parseClaimBody({})).toEqual({ ok: true, value: { max: 5 } });
  });
  it('принимает max 1..10 и отклоняет остальное', () => {
    expect(parseClaimBody({ max: 10 }).ok).toBe(true);
    for (const bad of [0, 11, 1.5, '3', null, -1]) {
      expect(parseClaimBody({ max: bad }).ok).toBe(false);
    }
  });
  it('лишние ключи и не-объекты отклоняются', () => {
    expect(parseClaimBody({ max: 1, x: 1 }).ok).toBe(false);
    expect(parseClaimBody([]).ok).toBe(false);
    expect(parseClaimBody(null).ok).toBe(false);
  });
});

describe('parseAckBody (0.13)', () => {
  it('валидный ack, code необязателен', () => {
    const r = parseAckBody({
      results: [item(), item({ jobId: 'job_87654321', code: 'no_player' })],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.results[0].code).toBeNull();
      expect(r.value.results[1].code).toBe('no_player');
    }
  });
  it('отклоняет пустой список, более 20, дубли jobId', () => {
    expect(parseAckBody({ results: [] }).ok).toBe(false);
    const many = Array.from({ length: 21 }, (_, i) =>
      item({ jobId: `job_${String(i).padStart(8, '0')}` }),
    );
    expect(parseAckBody({ results: many }).ok).toBe(false);
    expect(parseAckBody({ results: [item(), item()] }).ok).toBe(false);
  });
  it('отклоняет неизвестный статус, свободный текст в code, лишние ключи', () => {
    expect(parseAckBody({ results: [item({ status: 'ok' })] }).ok).toBe(false);
    expect(parseAckBody({ results: [item({ code: 'Bad Code!' })] }).ok).toBe(
      false,
    );
    expect(parseAckBody({ results: [item({ extra: 1 })] }).ok).toBe(false);
    expect(parseAckBody({ results: [item({ claimToken: 'x' })] }).ok).toBe(
      false,
    );
    expect(parseAckBody({ results: [item()], more: 1 }).ok).toBe(false);
  });
});
