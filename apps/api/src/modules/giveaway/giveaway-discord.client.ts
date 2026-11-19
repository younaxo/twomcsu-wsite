import { Inject, Injectable } from '@nestjs/common';
import { GIVEAWAY_CONFIG, GiveawayConfig } from './giveaway.config';
import {
  DISCORD_API,
  DISCORD_AUTHORIZE_URL,
  DISCORD_TIMEOUT_MS,
} from './giveaway.constants';

export interface DiscordIdentity {
  id: string;
  name: string;
  mfaEnabled: boolean;
}

/// Минимальный клиент Discord OAuth2 на встроенном fetch (ADR-G003 п. 2.3).
/// Не логирует коды, токены и ответы; любой сбой - null (вызывающий отказывает).
@Injectable()
export class GiveawayDiscordClient {
  constructor(
    @Inject(GIVEAWAY_CONFIG) private readonly config: GiveawayConfig,
  ) {}

  authorizeUrl(state: string, challenge: string): string {
    const a = this.config.admin;
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: a.discordClientId ?? '',
      redirect_uri: a.discordRedirectUri ?? '',
      scope: 'identify',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return `${DISCORD_AUTHORIZE_URL}?${q.toString()}`;
  }

  private async post(path: string, form: URLSearchParams): Promise<Response> {
    return fetch(`${DISCORD_API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
    });
  }

  /// Access-токен или null.
  async exchange(code: string, verifier: string): Promise<string | null> {
    const a = this.config.admin;
    try {
      const res = await this.post(
        '/oauth2/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: a.discordRedirectUri ?? '',
          code_verifier: verifier,
          client_id: a.discordClientId ?? '',
          client_secret: a.discordClientSecret ?? '',
        }),
      );
      if (!res.ok) return null;
      const body = (await res.json()) as { access_token?: unknown };
      return typeof body.access_token === 'string' && body.access_token !== ''
        ? body.access_token
        : null;
    } catch {
      return null;
    }
  }

  async identify(accessToken: string): Promise<DiscordIdentity | null> {
    try {
      const res = await fetch(`${DISCORD_API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(DISCORD_TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const u = (await res.json()) as {
        id?: unknown;
        username?: unknown;
        global_name?: unknown;
        mfa_enabled?: unknown;
      };
      if (typeof u.id !== 'string' || !/^[0-9]{5,32}$/.test(u.id)) return null;
      const display =
        typeof u.global_name === 'string' && u.global_name !== ''
          ? u.global_name
          : typeof u.username === 'string'
            ? u.username
            : u.id;
      return {
        id: u.id,
        name: display.slice(0, 64),
        mfaEnabled: u.mfa_enabled === true,
      };
    } catch {
      return null;
    }
  }

  /// Best effort: токен Discord нигде не хранится и сразу отзывается.
  async revoke(accessToken: string): Promise<void> {
    const a = this.config.admin;
    try {
      await this.post(
        '/oauth2/token/revoke',
        new URLSearchParams({
          token: accessToken,
          token_type_hint: 'access_token',
          client_id: a.discordClientId ?? '',
          client_secret: a.discordClientSecret ?? '',
        }),
      );
    } catch {
      /* ignore */
    }
  }
}
