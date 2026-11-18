import {
  isReportAuthorNotification,
  maskReportAuthorSender,
} from './report-author-privacy';

describe('isReportAuthorNotification', () => {
  it.each(['REPORT_STATUS_CHANGED', 'REPORT_VERDICT', 'SYSTEM'])(
    '%s со ссылкой /support/ — да',
    (type) => {
      expect(isReportAuthorNotification({ type, link: '/support/R-1' })).toBe(
        true,
      );
    },
  );

  it('чужой тип со ссылкой /support/ — нет', () => {
    expect(
      isReportAuthorNotification({ type: 'COMMENT', link: '/support/R-1' }),
    ).toBe(false);
    expect(
      isReportAuthorNotification({
        type: 'REPORT_ASSIGNED',
        link: '/support/R-1',
      }),
    ).toBe(false);
  });

  it('ссылка персонала /admin/reports/ — нет', () => {
    expect(
      isReportAuthorNotification({
        type: 'REPORT_STATUS_CHANGED',
        link: '/admin/reports/R-1',
      }),
    ).toBe(false);
    expect(
      isReportAuthorNotification({
        type: 'SYSTEM',
        link: '/admin/reports/R-1',
      }),
    ).toBe(false);
  });

  it('null/undefined/пустая ссылка и префикс без слеша — нет', () => {
    expect(isReportAuthorNotification({ type: 'SYSTEM', link: null })).toBe(
      false,
    );
    expect(isReportAuthorNotification({ type: 'SYSTEM' })).toBe(false);
    expect(isReportAuthorNotification({ type: 'SYSTEM', link: '' })).toBe(
      false,
    );
    expect(
      isReportAuthorNotification({ type: 'SYSTEM', link: '/supportive' }),
    ).toBe(false);
    expect(
      isReportAuthorNotification({ type: 'SYSTEM', link: 'x/support/R-1' }),
    ).toBe(false);
  });
});

describe('maskReportAuthorSender', () => {
  const fromUser = { id: 'm1', username: 'moder', avatar: 'a.png' };

  it('обнуляет fromUserId и fromUser у уведомления автору', () => {
    const res = maskReportAuthorSender({
      type: 'REPORT_VERDICT',
      link: '/support/R-1',
      fromUserId: 'm1',
      fromUser,
      title: 't',
    });
    expect(res.fromUserId).toBeNull();
    expect(res.fromUser).toBeNull();
    expect(res.title).toBe('t');
    expect(JSON.stringify(res)).not.toContain('moder');
  });

  it('без поля fromUser не добавляет его', () => {
    const res = maskReportAuthorSender({
      type: 'SYSTEM',
      link: '/support/R-1',
      fromUserId: 'm1',
    });
    expect(res.fromUserId).toBeNull();
    expect('fromUser' in res).toBe(false);
  });

  it('REPORT_ASSIGNED и /admin/reports/ не трогает', () => {
    const assigned = {
      type: 'REPORT_ASSIGNED',
      link: '/admin/reports/R-1',
      fromUserId: 'm1',
      fromUser,
    };
    expect(maskReportAuthorSender(assigned)).toBe(assigned);
    const other = {
      type: 'COMMENT',
      link: '/news/x',
      fromUserId: 'u',
      fromUser,
    };
    expect(maskReportAuthorSender(other)).toBe(other);
  });
});
