import { Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { NewsAdminService } from './news-admin.service';

@Controller('moderation/news/comments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NewsModerationController {
  constructor(private readonly admin: NewsAdminService) {}

  @Patch(':commentId/pin')
  @RequirePermissions('news.comments.pin')
  async pin(@Param('commentId') commentId: string) {
    return this.admin.pinComment(commentId, true);
  }

  @Patch(':commentId/unpin')
  @RequirePermissions('news.comments.pin')
  async unpin(@Param('commentId') commentId: string) {
    return this.admin.pinComment(commentId, false);
  }

  @Delete(':commentId')
  @RequirePermissions('news.comments.delete')
  async remove(
    @CurrentUser() moderator: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ) {
    await this.admin.moderateDeleteComment(moderator.id, commentId);
    return { success: true };
  }
}
