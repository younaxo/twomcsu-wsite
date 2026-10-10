import { normalizeSocialValue } from './profiles.service';

describe('ссылки соцсетей профиля (B5)', () => {
  it('сайт — только https; GitHub — ник или ссылка github.com', () => {
    expect(normalizeSocialValue('WEBSITE', 'https://twomc.su/me')).toBe(
      'https://twomc.su/me',
    );
    expect(normalizeSocialValue('WEBSITE', 'http://twomc.su')).toBeNull();
    expect(normalizeSocialValue('WEBSITE', 'javascript:alert(1)')).toBeNull();
    expect(normalizeSocialValue('GITHUB', 'octocat')).toBe(
      'https://github.com/octocat',
    );
    expect(normalizeSocialValue('GITHUB', 'https://github.com/octocat')).toBe(
      'https://github.com/octocat',
    );
    expect(normalizeSocialValue('GITHUB', 'https://evil.example/x')).toBeNull();
    expect(normalizeSocialValue('YOUTUBE', '  @channel  ')).toBe('@channel');
    expect(normalizeSocialValue('VK', '   ')).toBeNull();
  });
});
