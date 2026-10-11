import { ServerStatusCollector } from './server-status.collector';

function makeCollector(fetchAndLog: jest.Mock) {
  const prisma = {
    server: {
      findMany: jest.fn().mockResolvedValue([
        { id: 's1', address: 'play.example.test', port: 25565 },
        { id: 's2', address: 'down.example.test', port: 25565 },
        { id: 's3', address: 'mini.example.test', port: 25566 },
      ]),
    },
  };
  const collector = new ServerStatusCollector(
    prisma as never,
    { fetchAndLog } as never,
  );
  return { collector, prisma };
}

describe('ServerStatusCollector (ADR-0147)', () => {
  it('опрашивает только активные серверы', async () => {
    const fetchAndLog = jest.fn().mockResolvedValue({ online: true });
    const { collector, prisma } = makeCollector(fetchAndLog);
    await expect(collector.collect()).resolves.toBe(3);
    expect(prisma.server.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      select: { id: true, address: true, port: true },
    });
    expect(fetchAndLog).toHaveBeenCalledWith('s3', 'mini.example.test', 25566);
  });

  it('сбой одного сервера не останавливает остальных', async () => {
    const fetchAndLog = jest
      .fn()
      .mockResolvedValueOnce({ online: true })
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ online: false });
    const { collector } = makeCollector(fetchAndLog);
    await expect(collector.collect()).resolves.toBe(2);
    expect(fetchAndLog).toHaveBeenCalledTimes(3);
  });

  it('в тестовом окружении таймер не запускается', () => {
    const { collector } = makeCollector(jest.fn());
    const spy = jest.spyOn(global, 'setInterval');
    collector.onModuleInit();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
