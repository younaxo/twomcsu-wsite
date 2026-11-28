/// Контракт слоя доставки (ADR-0184 п. 1-2). Заказ не знает, чем выдаётся
/// товар: между оплатой и результатом стоит DeliveryService над заменяемыми
/// исполнителями.

/// Снимок задания: всё, что нужно исполнителю. Секретов других исполнителей и
/// данных покупателя (кроме ника) здесь нет. Поле `Product.gameCommands`
/// никогда не попадает в снимок (ADR-0184 Р1).
export interface DeliveryTaskSnapshot {
  taskId: string;
  orderItemId: string;
  orderId: string;
  step: number;
  executor: string;
  /// Номер попытки (растёт при каждом захвате, Р6).
  attempt: number;
  /// Ключ идемпотентности для внешних систем: `${orderItemId}:${step}`.
  idempotencyKey: string;
  /// Ник получателя (снимок), null если неизвестен.
  nick: string | null;
  /// Получатель — пользователь сайта (подарок: получатель, не покупатель).
  recipientUserId: string | null;
  quantity: number;
  /// Для сайтовой выдачи: украшение по `Product.decorationId`.
  decorationId: string | null;
  /// Готовая команда (после подстановки шаблона). В 0.7 всегда null.
  renderedCommand: string | null;
  /// Только для `bridge` (0.13): целевой сервер и расширение белого списка
  /// корней команд (настройки сайта); у остальных исполнителей null.
  bridge?: { serverSlug: string; extraCommandRoots: string[] } | null;
}

/// Закрытый набор результатов (ADR-0184 п. 1).
export type DeliveryResult =
  | { kind: 'delivered'; externalRef?: string }
  /// Известно, что НЕ выполнено (сбой до отправки).
  | { kind: 'retry'; reason: string; delayMs?: number }
  /// Окончательный отказ.
  | { kind: 'failed'; reason: string }
  /// Команда могла уйти, подтверждения нет: без автоповтора.
  | { kind: 'unknown'; reason: string }
  /// Ручная выдача (необязательная причина пишется в lastError).
  | { kind: 'awaiting_manual'; reason?: string };

export interface DeliveryExecutor {
  /// manual | site | command | (позже) wallet, bridge.
  readonly kind: string;
  /// Повторный запуск безопасен (сайтовая выдача по уникальному ключу).
  /// Для неидемпотентных исполнителей исключение и тайм-аут = `unknown`.
  readonly idempotent: boolean;
  /// Берётся ли задание воркером (manual ждёт человека, воркер его не берёт).
  readonly automatic: boolean;
  /// Необязательно: исполнитель сейчас способен работать (флаги окружения,
  /// ключи). Нет - воркер не берёт его задания, они остаются в очереди.
  operational?(): boolean;
  execute(task: DeliveryTaskSnapshot): Promise<DeliveryResult>;
}

/// Транспорт команды на игровой сервер (ADR-0184 п. 2). Конкретный транспорт
/// (RCON или плагин) в 0.7 НЕ реализуется: только интерфейс и тестовый мок.
export interface TransportAck {
  /// Необязательный идентификатор подтверждения на стороне транспорта.
  ref?: string;
}

///
/// Контракт дедупликации и подтверждения (R143, ADR-0184 поправка 2026-11-28):
/// транспорт ОБЯЗАН быть идемпотентным по `context.idempotencyKey` (повторная
/// отправка того же ключа не выполняет команду второй раз и возвращает прежнее
/// подтверждение) и возвращать `ack` только после подтверждения исполнения на
/// стороне сервера. Только такой транспорт объявляет `dedupAck: true`. Без
/// признака (RCON «выстрелил и забыл» не подходит) executor `command` считается
/// выключенным: автоматическая выдача командой не выполняется.
export interface CommandTransport {
  /// Транспорт заявляет идемпотентность по ключу и подтверждение исполнения.
  readonly dedupAck: true;
  /// Отправить одну команду. `CommandNotSentError` — известно, что команда не
  /// ушла (до отправки); любая другая ошибка и тайм-аут — исход неизвестен.
  send(
    command: string,
    context: { idempotencyKey: string },
  ): Promise<TransportAck>;
}

/// Сбой ДО отправки (отказ соединения, транспорт выключен): автоповтор допустим.
export class CommandNotSentError extends Error {
  constructor(message = 'command_not_sent') {
    super(message);
    this.name = 'CommandNotSentError';
  }
}

/// Токен внедрения транспорта; провайдера в 0.7 нет (команды не уходят никуда).
export const COMMAND_TRANSPORT = Symbol('COMMAND_TRANSPORT');
