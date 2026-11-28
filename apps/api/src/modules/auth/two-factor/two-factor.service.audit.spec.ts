import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { TwoFactorService } from './two-factor.service';
import { SecretBox } from './secret-box';
import { base32Decode, generateTotpSecret, hotp, totpStep } from './totp';

const KEY = 'k'.repeat(40);
const CTX = { ip: '203.0.113.7', userAgent: 'jest-agent' };

function setup(staff: boolean) {
  const secret = generateTotpSecret();
  const box = new SecretBox(KEY);
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const notifications = { create: jest.fn().mockResolvedValue(null) };
  const permissions = {
    getEffectivePermissions: jest.fn().mockResolvedValue({
      superuser: staff,
      permissions: [],
      maxPriority: 0,
    }),
  };
  const password = 'Correct-Horse-1';
  const tx = {
    user: { update: jest.fn().mockResolvedValue({}) },
    twoFactorBackupCode: {
      deleteMany: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({
        id: 'u1',
        twoFactorEnabled: true,
        twoFactorSecret: box.encrypt(secret),
        twoFactorLastStep: null,
        password: bcrypt.hashSync(password, 4),
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    twoFactorBackupCode: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn((cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const config = { get: jest.fn(() => KEY) };
  const service = new TwoFactorService(
    config as never,
    prisma as never,
    {} as never,
    audit as never,
    permissions as never,
    notifications as never,
  );
  const goodCode = hotp(base32Decode(secret), totpStep(Date.now()));
  return {
    service,
    audit,
    notifications,
    prisma,
    tx,
    password,
    goodCode,
    secret,
  };
}

describe('TwoFactorService: аудит событий 2FA (R181)', () => {
  it('disable: пишет critical для superuser, в той же транзакции, без секретов, и уведомляет', async () => {
    const t = setup(true);
    await t.service.disable('u1', t.password, t.goodCode, CTX);
    expect(t.audit.log).toHaveBeenCalledTimes(1);
    const entry = t.audit.log.mock.calls[0]![0];
    expect(entry).toMatchObject({
      actorId: 'u1',
      targetType: 'user',
      targetId: 'u1',
      action: '2fa.disable',
      severity: 'critical',
      ipAddress: CTX.ip,
      userAgent: CTX.userAgent,
      tx: t.tx,
      strict: true,
    });
    const dump = JSON.stringify(entry);
    expect(dump).not.toContain(t.goodCode);
    expect(dump).not.toContain(t.password);
    expect(dump).not.toContain(t.secret);
    expect(t.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', type: 'SYSTEM' }),
    );
  });

  it('disable обычного пользователя — info', async () => {
    const t = setup(false);
    await t.service.disable('u1', t.password, t.goodCode, CTX);
    expect(t.audit.log.mock.calls[0]![0].severity).toBe('info');
  });

  it('disable: неверный код и неверный пароль пишут warning без самого кода', async () => {
    const t = setup(true);
    await expect(
      t.service.disable('u1', t.password, '000000', CTX),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      t.service.disable('u1', 'wrong-password-x', '123456', CTX),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const [a, b] = t.audit.log.mock.calls.map((c) => c[0]);
    expect(a).toMatchObject({
      action: '2fa.disable.failed',
      severity: 'warning',
      changes: { reason: 'wrong_code' },
    });
    expect(b.changes).toEqual({ reason: 'wrong_password' });
    expect(JSON.stringify([a, b])).not.toContain('000000');
    expect(t.notifications.create).not.toHaveBeenCalled();
    expect(t.tx.user.update).not.toHaveBeenCalled();
  });

  it('regenerateBackupCodes: пишет аудит; сами коды в запись не попадают', async () => {
    const t = setup(false);
    const res = await t.service.regenerateBackupCodes('u1', t.goodCode, CTX);
    const entry = t.audit.log.mock.calls[0]![0];
    expect(entry.action).toBe('2fa.backup_codes.regenerate');
    expect(entry.changes).toEqual({ backupCodesIssued: 10 });
    const dump = JSON.stringify(entry);
    for (const c of res.backupCodes) expect(dump).not.toContain(c);
  });

  it('regenerateBackupCodes: неверный код — warning', async () => {
    const t = setup(false);
    await expect(
      t.service.regenerateBackupCodes('u1', '000000', CTX),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.audit.log.mock.calls[0]![0]).toMatchObject({
      action: '2fa.backup_codes.regenerate.failed',
      severity: 'warning',
    });
  });
});
