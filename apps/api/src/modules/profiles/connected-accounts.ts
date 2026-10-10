/// Ссылки привязанных аккаунтов в публичном профиле (D5). URL строится только
/// из данных реальной привязки (`UserExternalAccount`), а не из ручных
/// соцсетей; если у провайдера нет публичной страницы по нику — `null`, без
/// выдуманных адресов.

/// Публичный username Telegram: 5–32 символа, латиница, цифры и `_`.
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/;

export function connectedProfileUrl(
  provider: string,
  username: string | null,
): string | null {
  if (provider === 'telegram' && username && TELEGRAM_USERNAME.test(username)) {
    return `https://t.me/${username}`;
  }
  // Discord: публичной страницы профиля по нику нет (только по внутреннему
  // ID, который мы не раскрываем) — ссылки нет.
  return null;
}
