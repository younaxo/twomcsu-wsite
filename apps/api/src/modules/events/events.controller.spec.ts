import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

// Проводка контроллер -> сервис (Q22, ADR-0169): флаг twoFactorEnabled в типе
// viewer необязателен, tsc пропустит { id } без него, поэтому проверяем
// фактические аргументы вызова сервиса с точным объектом.
const viewer: AuthenticatedUser = {
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1',
  twoFactorEnabled: true,
};

function req(user: AuthenticatedUser | null): Request {
  return { user } as unknown as Request;
}

describe('EventsController: viewer с twoFactorEnabled доходит до сервиса', () => {
  const events = {
    attend: jest.fn().mockResolvedValue({}),
    featured: jest.fn().mockResolvedValue([]),
    bySlug: jest.fn().mockResolvedValue({}),
  };
  const controller = new EventsController(events as unknown as EventsService);

  beforeEach(() => jest.clearAllMocks());

  it('attend передаёт пользователя целиком, включая twoFactorEnabled', async () => {
    const dto = { status: 'GOING' } as never;
    await controller.attend(viewer, 'e1', dto);
    expect(events.attend).toHaveBeenCalledWith(
      {
        id: 'u1',
        email: 'u1@example.com',
        username: 'u1',
        twoFactorEnabled: true,
      },
      'e1',
      dto,
    );
  });

  it('featured передаёт viewer с twoFactorEnabled', async () => {
    await controller.featured(req(viewer));
    expect(events.featured).toHaveBeenCalledWith({
      id: 'u1',
      email: 'u1@example.com',
      username: 'u1',
      twoFactorEnabled: true,
    });
  });

  it('bySlug передаёт viewer с twoFactorEnabled', async () => {
    await controller.bySlug('slug', req(viewer));
    expect(events.bySlug).toHaveBeenCalledWith('slug', {
      id: 'u1',
      email: 'u1@example.com',
      username: 'u1',
      twoFactorEnabled: true,
    });
  });

  it('аноним: viewer = null', async () => {
    await controller.featured(req(null));
    expect(events.featured).toHaveBeenCalledWith(null);
  });
});
