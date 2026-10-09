import { Injectable } from '@nestjs/common';
import { QuickModerationService } from '../moderation/quick-moderation.service';
import { PermissionService } from '../roles/permission.service';
import { AuditService } from '../audit/audit.service';
import { BulkUserAction, BulkUsersDto } from './dto/bulk-users.dto';

export interface BulkUsersResult {
  succeeded: string[];
  failed: { userId: string; reason: string }[];
}

@Injectable()
export class AdminUsersBulkService {
  constructor(
    private readonly moderation: QuickModerationService,
    private readonly permissions: PermissionService,
    private readonly audit: AuditService,
  ) {}

  /// По каждому userId — отдельная проверка priority-иерархии и отдельная
  /// audit-запись (см. docs/technical/25-AUDIT-LOG.md: "Массовый бан — проверить,
  /// что логируется на каждого пользователя"). Один неудачный target не
  /// валит весь batch — тот же принцип устойчивости, что и в
  /// AchievementProgressService.checkAllUsers.
  async bulkUpdate(
    dto: BulkUsersDto,
    actorId: string,
  ): Promise<BulkUsersResult> {
    const result: BulkUsersResult = { succeeded: [], failed: [] };

    for (const userId of dto.userIds) {
      try {
        const canAct = await this.permissions.canActOn(actorId, userId);
        if (!canAct) {
          result.failed.push({
            userId,
            reason: 'Недостаточно прав для действия над этим пользователем',
          });
          continue;
        }

        if (dto.action === BulkUserAction.BAN) {
          await this.moderation.ban(userId, actorId, {
            reason: dto.reason ?? 'Массовая блокировка',
            durationHours: dto.durationHours,
          });
          await this.audit.log({
            actorId,
            action: 'user.ban',
            targetType: 'User',
            targetId: userId,
            changes: { reason: dto.reason, durationHours: dto.durationHours },
            severity: 'warning',
          });
        } else {
          await this.moderation.unban(userId);
          await this.audit.log({
            actorId,
            action: 'user.unban',
            targetType: 'User',
            targetId: userId,
          });
        }
        result.succeeded.push(userId);
      } catch (error) {
        result.failed.push({ userId, reason: (error as Error).message });
      }
    }

    return result;
  }
}
