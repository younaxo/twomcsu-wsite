import {
  CommandNotSentError,
  CommandTransport,
  TransportAck,
} from '../delivery-executor.interface';

/// Тестовый мок-транспорт (ADR-0184 п. 2): никакого RCON и сети. Запоминает
/// отправленные команды; режим задаётся тестом. В приложение не подключается.
export type MockTransportMode = 'ok' | 'not_sent' | 'error' | 'hang';

export class MockCommandTransport implements CommandTransport {
  readonly sent: Array<{ command: string; idempotencyKey: string }> = [];
  mode: MockTransportMode = 'ok';
  /// Для режима `hang`: вызвать, чтобы «подтверждение» пришло позже.
  private release: (() => void) | null = null;

  async send(
    command: string,
    context: { idempotencyKey: string },
  ): Promise<TransportAck> {
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
      return { ref: 'late' };
    }
    this.sent.push({ command, idempotencyKey: context.idempotencyKey });
    return { ref: `mock-${this.sent.length}` };
  }

  releaseHanging(): void {
    this.release?.();
    this.release = null;
  }
}
