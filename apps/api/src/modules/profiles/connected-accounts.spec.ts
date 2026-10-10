import { connectedProfileUrl } from './connected-accounts';

describe('connectedProfileUrl', () => {
  it('Telegram с username из привязки — t.me', () => {
    expect(connectedProfileUrl('telegram', 'younaxo')).toBe(
      'https://t.me/younaxo',
    );
  });

  it('Telegram без username или с недопустимым — без ссылки', () => {
    expect(connectedProfileUrl('telegram', null)).toBeNull();
    expect(connectedProfileUrl('telegram', 'abc')).toBeNull();
    expect(connectedProfileUrl('telegram', 'bad/../name')).toBeNull();
    expect(connectedProfileUrl('telegram', 'javascript:alert(1)')).toBeNull();
  });

  it('Discord — без выдуманного публичного URL', () => {
    expect(connectedProfileUrl('discord', 'younaxo')).toBeNull();
  });
});
