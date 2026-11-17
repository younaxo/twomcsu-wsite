import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { ReportsAdminController } from './reports-admin.controller';
import { ReportsModerationController } from './reports-moderation.controller';

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
