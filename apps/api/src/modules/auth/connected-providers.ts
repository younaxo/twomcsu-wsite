/// Реестр привязываемых аккаунтов (ADR-0095): один контракт для всех
/// провайдеров — ключ, внешний id, имя, аватар, публичная ссылка, видимость в
/// профиле, привязка/отвязка. Привязанный аккаунт = владение доказано входом у
/// провайдера; ручные соцсети так выдавать нельзя.
///
/// Discord и Telegram — работают (ADR-0069). VK и Steam — архитектура и UI
/// готовы, интеграции (VK ID OAuth, Steam OpenID) ещё нет: `integration: null`
/// → в настройках «Скоро», привязать нельзя. Google/GitHub позже добавляются
/// новой записью без изменения контракта.

export const CONNECTED_PROVIDERS = [
  'discord',
  'telegram',
  'vk',
  'steam',
] as const;
export type ConnectedProvider = (typeof CONNECTED_PROVIDERS)[number];

export interface ConnectedAccountRef {
  providerUserId: string;
  username: string | null;
}

export interface ConnectedProviderDef {
  key: ConnectedProvider;
  label: string;
  /// Чем подтверждается владение; null — интеграции пока нет.
  integration: 'oauth' | 'widget' | 'openid' | null;
  /// Публичная страница по данным привязки; нет такой — null (не выдумываем).
  profileUrl(account: ConnectedAccountRef): string | null;
}

const DISCORD_SNOWFLAKE = /^\d{17,20}$/;
const TELEGRAM_USERNAME = /^[A-Za-z0-9_]{5,32}$/;
const VK_SCREEN_NAME = /^[A-Za-z0-9_.]{2,32}$/;
const VK_ID = /^\d{1,12}$/;
const STEAM_ID64 = /^7656\d{13}$/;

export const PROVIDERS: Record<ConnectedProvider, ConnectedProviderDef> = {
  discord: {
    key: 'discord',
    label: 'Discord',
    integration: 'oauth',
    // Профиль Discord открывается по внешнему id (snowflake) из привязки, не
    // по нику: ник меняется и не уникален. Не snowflake — ссылки нет.
    profileUrl: ({ providerUserId }) =>
      DISCORD_SNOWFLAKE.test(providerUserId)
        ? `https://discord.com/users/${providerUserId}`
        : null,
  },
  telegram: {
    key: 'telegram',
    label: 'Telegram',
    integration: 'widget',
    profileUrl: ({ username }) =>
      username && TELEGRAM_USERNAME.test(username)
        ? `https://t.me/${username}`
        : null,
  },
  vk: {
    key: 'vk',
    label: 'ВКонтакте',
    integration: null,
    profileUrl: ({ username, providerUserId }) => {
      if (username && VK_SCREEN_NAME.test(username))
        return `https://vk.com/${username}`;
      return VK_ID.test(providerUserId)
        ? `https://vk.com/id${providerUserId}`
        : null;
    },
  },
  steam: {
    key: 'steam',
    label: 'Steam',
    integration: null,
    profileUrl: ({ providerUserId }) =>
      STEAM_ID64.test(providerUserId)
        ? `https://steamcommunity.com/profiles/${providerUserId}`
        : null,
  },
};

export function isConnectedProvider(value: string): value is ConnectedProvider {
  return (CONNECTED_PROVIDERS as readonly string[]).includes(value);
}

export function connectedProfileUrl(
  provider: string,
  account: ConnectedAccountRef,
): string | null {
  return isConnectedProvider(provider)
    ? PROVIDERS[provider].profileUrl(account)
    : null;
}
