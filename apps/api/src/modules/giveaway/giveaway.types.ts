import type { Request } from 'express';

export interface GiveawayAuthContext {
  keyId: string;
  serverId: string;
  version: number;
}

export type GiveawayRequest = Request & {
  rawBody?: Buffer;
  giveaway?: GiveawayAuthContext;
};
