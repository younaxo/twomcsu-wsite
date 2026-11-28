import { ProfilesService } from './profiles.service';

const rawBadge = {
  id: 'b1',
  type: 'VIP',
  isActive: true,
  expiresAt: null,
};

function userRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u1',
    shortId: 's1',
    tag: 'u1',
    discriminator: 7,
    username: 'user1',
    avatar: null,
    banner: null,
    bannerPreset: null,
    statusText: null,
    bio: null,
    position: null,
    selectedDecoration: null,
    displayBadge: rawBadge,
    commentsEnabled: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    email: 'a@b.c',
    hideEmail: true,
    hideCountry: true,
    hideCity: true,
    hideGender: true,
    hideBirthDate: true,
    hideSocials: true,
    birthDate: null,
    showBirthDate: false,
    ...overrides,
  };
}

function make(row: Record<string, unknown>) {
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(row),
    },
  };
  const storage = { publicUrl: (v: string | null) => v };
  const service = new ProfilesService(
    prisma as never,
    storage as never,
    {} as never,
    {} as never,
  );
  return service;
}

describe('displayBadge наружу: только {id,type}', () => {
  it('/users/me (getOwnProfile) не отдаёт isActive/expiresAt', async () => {
    const res = await make(userRow()).getOwnProfile('u1');
    expect(res.displayBadge).toEqual({ id: 'b1', type: 'VIP' });
  });

  it('/users/me: неактивный или просроченный бейдж -> null', async () => {
    const inactive = await make(
      userRow({ displayBadge: { ...rawBadge, isActive: false } }),
    ).getOwnProfile('u1');
    expect(inactive.displayBadge).toBeNull();
    const expired = await make(
      userRow({ displayBadge: { ...rawBadge, expiresAt: new Date(1) } }),
    ).getOwnProfile('u1');
    expect(expired.displayBadge).toBeNull();
  });

  it('applyPrivacy явно чистит displayBadge до {id,type}', () => {
    const service = make(userRow());
    const out = (
      service as unknown as {
        applyPrivacy(u: unknown): Record<string, unknown>;
      }
    ).applyPrivacy(userRow());
    expect(out.displayBadge).toEqual({ id: 'b1', type: 'VIP' });
    const none = (
      service as unknown as {
        applyPrivacy(u: unknown): Record<string, unknown>;
      }
    ).applyPrivacy(userRow({ displayBadge: null }));
    expect(none.displayBadge).toBeNull();
  });
});
