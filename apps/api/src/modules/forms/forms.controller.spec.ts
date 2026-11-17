import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

// Проводка контроллер -> сервис (Q22, ADR-0169): twoFactorEnabled в типе
// viewer необязателен, поэтому проверяем точные аргументы вызова сервиса.
const viewer: AuthenticatedUser = {
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1',
  twoFactorEnabled: true,
};
const expectedViewer = {
  id: 'u1',
  email: 'u1@example.com',
  username: 'u1',
  twoFactorEnabled: true,
};

describe('FormsController: viewer с twoFactorEnabled доходит до сервиса', () => {
  const forms = {
    getBySlug: jest.fn().mockResolvedValue({}),
    saveDraft: jest.fn().mockResolvedValue({}),
  };
  const controller = new FormsController(forms as unknown as FormsService);

  beforeEach(() => jest.clearAllMocks());

  it('getBySlug передаёт viewer с twoFactorEnabled', async () => {
    await controller.getBySlug('f', { user: viewer } as unknown as Request);
    expect(forms.getBySlug).toHaveBeenCalledWith('f', expectedViewer);
  });

  it('getBySlug: аноним — null', async () => {
    await controller.getBySlug('f', {} as unknown as Request);
    expect(forms.getBySlug).toHaveBeenCalledWith('f', null);
  });

  it('saveDraft передаёт пользователя целиком, включая twoFactorEnabled', async () => {
    const dto = { answers: {} } as never;
    await controller.saveDraft(viewer, 'f', dto);
    expect(forms.saveDraft).toHaveBeenCalledWith('f', expectedViewer, dto);
  });
});
