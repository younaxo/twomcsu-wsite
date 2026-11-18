import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { InventoryGroup } from './inventory-contract';
import { PrismaService } from '../prisma/prisma.service';
import { SCHEMA_VERSION } from './inventory-limits';
import type {
  InventoryDecision,
  InventoryKey,
  InventoryStore,
  StoredInventory,
  StoredInventoryRow,
} from './inventory.store';
import type { ApplyResult } from './inventory.types';

/// Число повторов при конфликте сериализации (P2034) или гонке вставки (P2002).
const MAX_ATTEMPTS = 4;

/// Явные быстрые опции (прежние умолчания Prisma 2000/5000), а не общие
/// 10 с/10 с из PRISMA_TX_*: при MAX_ATTEMPTS = 4 общие значения дали бы
/// до 80 с удержания запроса плагина. Транзакция короткая (чтение + upsert),
/// быстрый отказ предпочтительнее; плагин повторяет отправку сам (ADR-0183).
export const TX_MAX_WAIT_MS = 2000;
export const TX_TIMEOUT_MS = 5000;

function isRetryable(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    (error.code === 'P2034' || error.code === 'P2002')
  );
}

@Injectable()
export class PrismaInventoryStore implements InventoryStore {
  constructor(private readonly prisma: PrismaService) {}

  async findUserIdByUuid(uuid: string): Promise<string | null> {
    const account = await this.prisma.minecraftAccount.findUnique({
      where: { uuid },
      select: { userId: true },
    });
    return account?.userId ?? null;
  }

  async mutate(
    key: InventoryKey,
    decide: (current: StoredInventory | null) => InventoryDecision,
  ): Promise<ApplyResult> {
    const where = {
      userId_serverSlug_grp: {
        userId: key.userId,
        serverSlug: key.serverSlug,
        grp: key.group,
      },
    };
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(
          async (tx) => {
            const row = await tx.playerInventory.findUnique({ where });
            const current: StoredInventory | null = row
              ? {
                  epoch: row.epoch,
                  rev: row.rev,
                  slots: row.slots,
                  slotCount: row.slotCount,
                  contentHash: row.contentHash,
                  capturedAt: row.capturedAt,
                  lastSeenAt: row.lastSeenAt,
                  playerOnline: row.playerOnline,
                }
              : null;
            const { write, result } = decide(current);
            if (write === null) return result;
            if (write.kind === 'touch') {
              await tx.playerInventory.update({
                where,
                data: {
                  epoch: write.epoch,
                  rev: write.rev,
                  capturedAt: write.capturedAt,
                  lastSeenAt: write.lastSeenAt,
                  playerOnline: write.playerOnline,
                },
              });
              return result;
            }
            const data = {
              epoch: write.epoch,
              rev: write.rev,
              slots: write.slots as unknown as Prisma.InputJsonValue,
              slotCount: write.slots.length,
              contentHash: write.contentHash,
              capturedAt: write.capturedAt,
              lastSeenAt: write.lastSeenAt,
              playerOnline: write.playerOnline,
              schemaVersion: SCHEMA_VERSION,
            };
            await tx.playerInventory.upsert({
              where,
              create: {
                userId: key.userId,
                serverSlug: key.serverSlug,
                grp: key.group,
                ...data,
              },
              update: data,
            });
            return result;
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: TX_MAX_WAIT_MS,
            timeout: TX_TIMEOUT_MS,
          },
        );
      } catch (error) {
        if (!isRetryable(error)) throw error;
        lastError = error;
      }
    }
    throw lastError;
  }

  async listForUser(
    userId: string,
    serverSlug?: string,
  ): Promise<StoredInventoryRow[]> {
    const rows = await this.prisma.playerInventory.findMany({
      where: { userId, ...(serverSlug ? { serverSlug } : {}) },
      orderBy: [{ serverSlug: 'asc' }, { grp: 'asc' }],
    });
    return rows.map((row) => ({
      serverSlug: row.serverSlug,
      group: row.grp as InventoryGroup,
      epoch: row.epoch,
      rev: row.rev,
      slots: row.slots,
      slotCount: row.slotCount,
      contentHash: row.contentHash,
      capturedAt: row.capturedAt,
      lastSeenAt: row.lastSeenAt,
      playerOnline: row.playerOnline,
    }));
  }

  async deleteForUser(userId: string): Promise<number> {
    const { count } = await this.prisma.playerInventory.deleteMany({
      where: { userId },
    });
    return count;
  }

  async deleteStale(cutoff: Date): Promise<number> {
    const { count } = await this.prisma.playerInventory.deleteMany({
      where: { lastSeenAt: { lt: cutoff } },
    });
    return count;
  }
}
