import { BadRequestException } from '@nestjs/common';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { ReportsAdminController } from './reports-admin.controller';
import { ReportsModerationController } from './reports-moderation.controller';
import { ReportsModerationService } from './reports-moderation.service';

/// Каждый хендлер staff-контроллеров обращений обязан иметь
/// @RequirePermissions (иначе PermissionsGuard пропустит любого игрока).
function handlers(controller: { prototype: object }): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) => name !== 'constructor',
  );
}

describe.each([
  ['ReportsModerationController', ReportsModerationController],
  ['ReportsAdminController', ReportsAdminController],
])('RBAC: %s', (_name, controller) => {
  it('все эндпоинты защищены @RequirePermissions', () => {
    const missing = handlers(controller).filter((name) => {
      const keys = Reflect.getMetadata(
        PERMISSIONS_KEY,
        (controller.prototype as unknown as Record<string, object>)[name],
      ) as string[] | undefined;
      return !keys || keys.length === 0;
    });
    expect(missing).toEqual([]);
  });
});

describe('RBAC: история обращения', () => {
  it('GET :reportNumber/history требует reports.view', () => {
    const keys = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ReportsModerationController.prototype.history,
    ) as string[];
    expect(keys).toEqual(['reports.view']);
  });
});

describe('RBAC: срез 2', () => {
  const keysOf = (name: keyof ReportsModerationController) =>
    Reflect.getMetadata(
      PERMISSIONS_KEY,
      ReportsModerationController.prototype[name],
    ) as string[];

  it('assignable-staff требует reports.assign', () => {
    expect(keysOf('assignableStaff')).toEqual(['reports.assign']);
  });

  it('правка заметки — reports.notes (автор/reports.notes.edit проверяет сервис)', () => {
    expect(keysOf('updateNote')).toEqual(['reports.notes']);
  });

  it('pin — reports.notes.pin, unpin — reports.notes.unpin', () => {
    expect(keysOf('pinNote')).toEqual(['reports.notes.pin']);
    expect(keysOf('unpinNote')).toEqual(['reports.notes.unpin']);
  });
});

describe('M1: pin заметки только закрепляет, unpin — только через DELETE', () => {
  const pinModeratorNote = jest.fn().mockResolvedValue({ ok: true });
  const controller = new ReportsModerationController({
    pinModeratorNote,
  } as unknown as ReportsModerationService);

  beforeEach(() => pinModeratorNote.mockClear());

  it('PATCH без тела и с pinned:true закрепляет', async () => {
    await controller.pinNote('R-1', 'n1', {});
    await controller.pinNote('R-1', 'n1', { pinned: true });
    expect(pinModeratorNote).toHaveBeenNthCalledWith(1, 'R-1', 'n1', true);
    expect(pinModeratorNote).toHaveBeenNthCalledWith(2, 'R-1', 'n1', true);
  });

  it('PATCH с pinned:false -> 400, сервис не вызывается', async () => {
    await expect(
      controller.pinNote('R-1', 'n1', { pinned: false }),
    ).rejects.toThrow(BadRequestException);
    await expect(
      controller.pinNote('R-1', 'n1', { pinned: false }),
    ).rejects.toThrow(/DELETE/);
    expect(pinModeratorNote).not.toHaveBeenCalled();
  });

  it('DELETE открепляет под reports.notes.unpin, не требуя reports.notes.pin', async () => {
    await controller.unpinNote('R-1', 'n1');
    expect(pinModeratorNote).toHaveBeenCalledWith('R-1', 'n1', false);
    const pinKeys = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ReportsModerationController.prototype.pinNote,
    ) as string[];
    const unpinKeys = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ReportsModerationController.prototype.unpinNote,
    ) as string[];
    expect(pinKeys).not.toContain('reports.notes.unpin');
    expect(unpinKeys).not.toContain('reports.notes.pin');
  });
});

describe('Q52: DELETE заметки — право и передача актора', () => {
  it('DELETE notes/:noteId требует reports.notes (edit/unpin проверяет сервис)', () => {
    const keys = Reflect.getMetadata(
      PERMISSIONS_KEY,
      ReportsModerationController.prototype.deleteNote,
    ) as string[];
    expect(keys).toEqual(['reports.notes']);
  });

  it('контроллер передаёт user.id третьим аргументом', async () => {
    const deleteModeratorNote = jest.fn().mockResolvedValue({ ok: true });
    const controller = new ReportsModerationController({
      deleteModeratorNote,
    } as unknown as ReportsModerationService);
    await controller.deleteNote('R-1', 'n1', { id: 'actor-1' } as never);
    expect(deleteModeratorNote).toHaveBeenCalledWith('R-1', 'n1', 'actor-1');
  });
});
