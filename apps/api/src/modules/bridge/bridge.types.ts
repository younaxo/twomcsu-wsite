import { BridgeServer } from '@prisma/client';
import { Request } from 'express';
import { BridgeCapability } from './bridge.constants';

/// Результат успешной проверки подписи. `slug` берётся ТОЛЬКО из ключа.
export interface BridgeAuthContext {
  keyId: string;
  slug: string;
  generation: number;
  server: BridgeServer;
  capabilities: ReadonlySet<BridgeCapability>;
}

export type BridgeRequest = Request & {
  rawBody?: Buffer;
  bridge?: BridgeAuthContext;
};
