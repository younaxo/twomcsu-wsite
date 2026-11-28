import {
  CommandNotSentError,
  CommandTransport,
  TransportAck,
} from '../delivery-executor.interface';

/// Тестовый мок-транспорт (ADR-0184 п. 2): никакого RCON и сети. Запоминает
/// отправленные команды; режим задаётся тестом. В приложение не подключается.
export type MockTransportMode = 'ok' | 'not_sent' | 'error' | 'hang';

export class MockCommandTransport implements CommandTransport {
  readonly dedupAck = true as const;
  /// Журнал выполненных ключей: повтор того же ключа не выполняется заново
  /// (контракт идемпотентности транспорта, R143).
  private readonly done = new Map<string, TransportAck>();
  /// Сколько раз ключ был предъявлен (в т.ч. дубли), для проверки в тестах.
  readonly attempts: string[] = [];
  readonly sent: Array<{ command: string; idempotencyKey: string }> = [];
  mode: MockTransportMode = 'ok';
  /// Для режима `hang`: вызвать, чтобы «подтверждение» пришло позже.
  private release: (() => void) | null = null;

  async send(
    command: string,
    context: { idempotencyKey: string },
  ): Promise<TransportAck> {
    this.attempts.push(context.idempotencyKey);
    const prior = this.done.get(context.idempotencyKey);
    if (prior) return prior;
    if (this.mode === 'not_sent') {
      throw new CommandNotSentError('connection refused');
    }
    if (this.mode === 'error') {
      throw new Error('socket hang up');
    }
    if (this.mode === 'hang') {
      this.sent.push({ command, idempotencyKey: context.idempotencyKey });
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
      const late = { ref: 'late' };
      this.done.set(context.idempotencyKey, late);
      return late;
    }
    this.sent.push({ command, idempotencyKey: context.idempotencyKey });
    const ack = { ref: `mock-${this.sent.length}` };
    this.done.set(context.idempotencyKey, ack);
    return ack;
  }

  releaseHanging(): void {
    this.release?.();
    this.release = null;
  }
}
