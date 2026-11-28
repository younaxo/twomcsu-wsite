import { CommandExecutor } from './command.executor';
import { MockCommandTransport } from './mock-command-transport';
import type {
  CommandTransport,
  DeliveryTaskSnapshot,
} from '../delivery-executor.interface';

function task(over: Partial<DeliveryTaskSnapshot> = {}): DeliveryTaskSnapshot {
  return {
    taskId: 't1',
    orderItemId: 'i1',
    orderId: 'o1',
    step: 1,
    executor: 'command',
    attempt: 1,
    idempotencyKey: 'i1:1',
    nick: 'Steve',
    recipientUserId: 'u1',
    quantity: 1,
    decorationId: null,
    renderedCommand: 'say hi',
    ...over,
  };
}

describe('CommandExecutor (R143, fail closed)', () => {
  it('без транспорта: ручная выдача, не retry, operational=false', async () => {
    const ex = new CommandExecutor();
    expect(ex.operational()).toBe(false);
    await expect(ex.execute(task())).resolves.toEqual({
      kind: 'awaiting_manual',
      reason: 'transport_unavailable',
    });
  });

  it('транспорт без признака dedupAck: не выполняет, ручная выдача', async () => {
    const send = jest.fn();
    const legacy = { send } as unknown as CommandTransport;
    const ex = new CommandExecutor(legacy);
    expect(ex.operational()).toBe(false);
    await expect(ex.execute(task())).resolves.toMatchObject({
      kind: 'awaiting_manual',
    });
    expect(send).not.toHaveBeenCalled();
  });

  it('без renderedCommand и с негодным ником: failed, без отправки', async () => {
    const transport = new MockCommandTransport();
    const ex = new CommandExecutor(transport);
    await expect(ex.execute(task({ renderedCommand: null }))).resolves.toEqual({
      kind: 'failed',
      reason: 'no_command',
    });
    await expect(ex.execute(task({ nick: '@a' }))).resolves.toEqual({
      kind: 'failed',
      reason: 'invalid_nick',
    });
    expect(transport.sent).toHaveLength(0);
  });

  it('с транспортом dedupAck: operational, отправка с idempotencyKey', async () => {
    const transport = new MockCommandTransport();
    const ex = new CommandExecutor(transport);
    expect(ex.operational()).toBe(true);
    await expect(ex.execute(task())).resolves.toEqual({
      kind: 'delivered',
      externalRef: 'mock-1',
    });
    expect(transport.sent).toEqual([
      { command: 'say hi', idempotencyKey: 'i1:1' },
    ]);
  });

  it('контракт идемпотентности: тот же ключ не выполняется повторно', async () => {
    const transport = new MockCommandTransport();
    const ex = new CommandExecutor(transport);
    const first = await ex.execute(task());
    const second = await ex.execute(task({ attempt: 2 }));
    expect(second).toEqual(first);
    expect(transport.attempts).toEqual(['i1:1', 'i1:1']);
    expect(transport.sent).toHaveLength(1);
  });

  it('обрыв после отправки: unknown; сбой до отправки: retry', async () => {
    const transport = new MockCommandTransport();
    const ex = new CommandExecutor(transport);
    transport.mode = 'error';
    await expect(ex.execute(task())).resolves.toMatchObject({
      kind: 'unknown',
    });
    transport.mode = 'not_sent';
    await expect(ex.execute(task())).resolves.toMatchObject({ kind: 'retry' });
  });
});
