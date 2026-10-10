import {
  CONNECTED_PROVIDERS,
  PROVIDERS,
  connectedProfileUrl,
  isConnectedProvider,
} from './connected-providers';

const ref = (providerUserId: string, username: string | null = null) => ({
  providerUserId,
  username,
});

describe('connected-providers', () => {
  it('единый реестр: Discord, Telegram, VK, Steam — с одинаковым контрактом', () => {
    expect(CONNECTED_PROVIDERS).toEqual(['discord', 'telegram', 'vk', 'steam']);
    for (const key of CONNECTED_PROVIDERS) {
      expect(PROVIDERS[key].key).toBe(key);
      expect(typeof PROVIDERS[key].profileUrl).toBe('function');
    }
    expect(isConnectedProvider('google')).toBe(false);
  });

  it('VK и Steam без интеграции — привязать нельзя (не fake linking)', () => {
    expect(PROVIDERS.vk.integration).toBeNull();
    expect(PROVIDERS.steam.integration).toBeNull();
    expect(PROVIDERS.discord.integration).not.toBeNull();
    expect(PROVIDERS.telegram.integration).not.toBeNull();
  });

  it('Telegram — t.me только с валидным username из привязки', () => {
    expect(connectedProfileUrl('telegram', ref('1', 'younaxo'))).toBe(
      'https://t.me/younaxo',
    );
    expect(connectedProfileUrl('telegram', ref('1'))).toBeNull();
    expect(connectedProfileUrl('telegram', ref('1', 'abc'))).toBeNull();
    expect(
      connectedProfileUrl('telegram', ref('1', 'javascript:alert(1)')),
    ).toBeNull();
  });

  it('VK — по screen_name или по числовому id', () => {
    expect(connectedProfileUrl('vk', ref('123', 'younaxo'))).toBe(
      'https://vk.com/younaxo',
    );
    expect(connectedProfileUrl('vk', ref('123'))).toBe('https://vk.com/id123');
    expect(connectedProfileUrl('vk', ref('../x', '//evil'))).toBeNull();
  });

  it('Steam — профиль по SteamID64', () => {
    expect(connectedProfileUrl('steam', ref('76561198000000000'))).toBe(
      'https://steamcommunity.com/profiles/76561198000000000',
    );
    expect(connectedProfileUrl('steam', ref('123'))).toBeNull();
  });

  it('Discord — без выдуманного публичного URL; неизвестный провайдер — null', () => {
    expect(connectedProfileUrl('discord', ref('1', 'younaxo'))).toBeNull();
    expect(connectedProfileUrl('google', ref('1', 'younaxo'))).toBeNull();
  });
});
