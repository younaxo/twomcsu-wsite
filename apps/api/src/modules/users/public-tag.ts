/// Публичная identity `username#0000` (ADR-0099): discriminator — число
/// 0000–9999, всегда четыре цифры. Не DB ID и не shortId.

export const DISCRIMINATOR_MAX = 9999;

export function formatDiscriminator(value: number): string {
  return String(value).padStart(4, '0');
}

export function publicTag(username: string, discriminator: number): string {
  return `${username}#${formatDiscriminator(discriminator)}`;
}
