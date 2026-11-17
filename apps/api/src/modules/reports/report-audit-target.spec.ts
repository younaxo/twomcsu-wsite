import { resolveTarget } from '../audit/audit.interceptor';

/// События заметок/сообщений попадают в history обращения: маршруты не имеют
/// :id/:userId..., поэтому targetId берётся из результата хендлера, а все
/// мутации возвращают обращение (id = report.id).
describe('audit target для мутаций заметок', () => {
  it('params заметки не перебивают targetId, берётся id обращения из результата', () => {
    const target = resolveTarget(
      { reportNumber: 'R-1', noteId: 'n1' },
      { id: 'report-id', moderatorNotes: [] },
    );
    expect(target).toEqual({ targetId: 'report-id' });
  });
});
