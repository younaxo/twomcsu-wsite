import { Injectable } from '@nestjs/common';
import {
  Disposable,
  NormalizedPunishment,
  PunishmentKind,
  PunishmentSource,
  SourceEvent,
  SourceHealth,
  SourceNotConfigured,
} from '../punishments/punishment.types';

/// Событие Bridge для синхронизатора этапа 02: обычный `SourceEvent` плюс
/// сервер-источник и область идентификаторов (`BridgeServer.sourceScope`,
/// ключ зеркала `(source, sourceScope, kind, sourceId)`).
export type BridgeSourceEvent = SourceEvent & {
  serverSlug: string;
  sourceScope: string;
};

export type BridgeSourceHandler = (
  event: BridgeSourceEvent,
) => void | Promise<void>;

/// Нет подписчика, способного записать событие в зеркало: приёмник отвечает
/// 503 (плагин повторит пачку), а не `accepted` без применения.
export class NoPunishmentSubscriber extends Error {
  constructor() {
    super('Нет подписчика событий наказаний Bridge');
    this.name = 'NoPunishmentSubscriber';
  }
}

/// Источник наказаний «Bridge» (этап 03) - push-адаптер интерфейса
/// `PunishmentSource` этапа 02 (`id = 'bridge'`, есть `subscribe`). Приёмник
/// не пишет в зеркало сам: он вызывает `publish`, а запись выполняет
/// подписчик (синхронизатор этапа 02). Методы чтения (опрос) не поддержаны:
/// у Bridge нет собственного хранилища состояния, и подмена пустым ответом
/// привела бы к ложной пометке `DELETED_AT_SOURCE` при сверке.
@Injectable()
export class BridgePunishmentSource implements PunishmentSource {
  readonly id = 'bridge' as const;
  private readonly handlers = new Set<BridgeSourceHandler>();

  health(): Promise<SourceHealth> {
    return Promise.resolve({ ok: true, serverTimeMs: Date.now() });
  }

  fetchBatch(
    _kind: PunishmentKind,
    _afterId: bigint,
    _limit: number,
  ): Promise<NormalizedPunishment[]> {
    return Promise.reject(new SourceNotConfigured());
  }

  drainSkippedIds(_kind: PunishmentKind): bigint[] {
    return [];
  }

  fetchByIds(
    _kind: PunishmentKind,
    _ids: bigint[],
  ): Promise<{ found: NormalizedPunishment[]; missing: bigint[] }> {
    return Promise.reject(new SourceNotConfigured());
  }

  maxId(_kind: PunishmentKind): Promise<bigint> {
    return Promise.reject(new SourceNotConfigured());
  }

  resolveNames(_uuids: string[]): Promise<Map<string, string>> {
    return Promise.resolve(new Map());
  }

  /// Тип параметра шире интерфейса (обработчик может быть асинхронным и
  /// получает поля сервера): для вызывающего по `PunishmentSource` он
  /// совместим по методу (bivariance).
  subscribe(handler: BridgeSourceHandler): Disposable {
    this.handlers.add(handler);
    return { dispose: () => void this.handlers.delete(handler) };
  }

  get hasSubscribers(): boolean {
    return this.handlers.size > 0;
  }

  /// Передаёт событие подписчикам и ждёт завершения записи. Исключение
  /// подписчика пробрасывается (транзакция приёмника откатится).
  async publish(event: BridgeSourceEvent): Promise<void> {
    if (this.handlers.size === 0) throw new NoPunishmentSubscriber();
    for (const handler of [...this.handlers]) {
      await handler(event);
    }
  }

  close(): Promise<void> {
    this.handlers.clear();
    return Promise.resolve();
  }
}
