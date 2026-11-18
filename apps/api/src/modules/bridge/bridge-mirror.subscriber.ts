import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  PUNISHMENT_MIRROR_STORE,
  PunishmentMirrorStore,
} from '../punishments/punishment-mirror.store';
import { Disposable } from '../punishments/punishment.types';
import {
  BridgePunishmentSource,
  BridgeSourceEvent,
} from './bridge-punishment.source';
import {
  BRIDGE_CONFIG,
  BridgeConfig,
  isBridgeOperational,
} from './bridge.config';

/// Идентификатор источника в ключе зеркала `(source, sourceScope, kind, sourceId)`.
export const BRIDGE_MIRROR_SOURCE = 'bridge';

/// Подписчик синхронизации этапа 02 на `BridgePunishmentSource`: пишет события
/// Bridge в зеркало наказаний со своей областью `sourceScope` (из
/// `BridgeServer.sourceScope`). Запись идемпотентна (upsert по ключу и
/// `rowHash`), поэтому повтор события после сбоя безопасен. Поведение
/// LiteBans-источника (`source = 'litebans'`, область `default`) не меняется.
/// Подписка создаётся только при включённом Bridge: иначе приёмник отвечает 503
/// до применения.
@Injectable()
export class BridgeMirrorSubscriber implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BridgeMirrorSubscriber.name);
  private subscription: Disposable | null = null;

  constructor(
    @Inject(BRIDGE_CONFIG) private readonly config: BridgeConfig,
    private readonly source: BridgePunishmentSource,
    @Inject(PUNISHMENT_MIRROR_STORE)
    private readonly store: PunishmentMirrorStore,
  ) {}

  onModuleInit(): void {
    if (!isBridgeOperational(this.config)) return;
    this.subscription = this.source.subscribe((event) => this.apply(event));
    this.logger.log('Подписчик зеркала наказаний Bridge подключён');
  }

  onModuleDestroy(): void {
    this.subscription?.dispose();
    this.subscription = null;
  }

  async apply(event: BridgeSourceEvent): Promise<void> {
    const now = new Date();
    if (event.type === 'deleted') {
      await this.store.markDeletedAtSource(
        BRIDGE_MIRROR_SOURCE,
        event.kind,
        [BigInt(event.sourceId)],
        now,
        undefined,
        event.sourceScope,
      );
      return;
    }
    await this.store.applyBatch(
      BRIDGE_MIRROR_SOURCE,
      event.punishment.kind,
      [event.punishment],
      null,
      now,
      event.sourceScope,
    );
  }
}
