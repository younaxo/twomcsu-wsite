import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AddReportMessageDto } from './dto/add-report-message.dto';
import { AssignableStaffQueryDto } from './dto/assignable-staff-query.dto';
import { AssignReportDto } from './dto/assign-report.dto';
import { ChangeReportStatusDto } from './dto/change-report-status.dto';
import { CreateModeratorNoteDto } from './dto/create-moderator-note.dto';
import { ReportHistoryQueryDto } from './dto/report-history-query.dto';
import { StaffListReportsQueryDto } from './dto/staff-list-reports-query.dto';
import { PinModeratorNoteDto } from './dto/pin-moderator-note.dto';
import { LockReportDto } from './dto/lock-report.dto';
import { SetVerdictDto } from './dto/set-verdict.dto';
import { SoftDeleteMessageDto } from './dto/soft-delete-message.dto';
import { UpdateModeratorNoteDto } from './dto/update-moderator-note.dto';
import { ReportsModerationService } from './reports-moderation.service';

@Controller('moderation/reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsModerationController {
  constructor(private readonly moderation: ReportsModerationService) {}

  @Get()
  @RequirePermissions('reports.view')
  async list(
    @Query() query: StaffListReportsQueryDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.listModeration(query, user.id);
  }

  @Get('assignable-staff')
  @RequirePermissions('reports.assign')
  async assignableStaff(@Query() query: AssignableStaffQueryDto) {
    return this.moderation.assignableStaff(query);
  }

  @Get(':reportNumber/history')
  @RequirePermissions('reports.view')
  async history(
    @Param('reportNumber') reportNumber: string,
    @Query() query: ReportHistoryQueryDto,
  ) {
    return this.moderation.history(reportNumber, query);
  }

  @Patch(':reportNumber/assign')
  @RequirePermissions('reports.assign')
  async assign(
    @Param('reportNumber') reportNumber: string,
    @Body() dto: AssignReportDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.assign(reportNumber, dto, user.id);
  }

  @Patch(':reportNumber/status')
  @RequirePermissions('reports.status')
  async changeStatus(
    @Param('reportNumber') reportNumber: string,
    @Body() dto: ChangeReportStatusDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.changeStatus(reportNumber, dto, user.id);
  }

  @Patch(':reportNumber/verdict')
  @RequirePermissions('reports.verdict')
  async setVerdict(
    @Param('reportNumber') reportNumber: string,
    @Body() dto: SetVerdictDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.setVerdict(reportNumber, dto, user.id);
  }

  @Post(':reportNumber/messages')
  @RequirePermissions('reports.messages')
  async addMessage(
    @Param('reportNumber') reportNumber: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AddReportMessageDto,
  ) {
    return this.moderation.addMessage(reportNumber, user.id, dto);
  }

  @Delete(':reportNumber/messages/:messageId')
  @RequirePermissions('reports.messages')
  async softDeleteMessage(
    @Param('reportNumber') reportNumber: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SoftDeleteMessageDto,
  ) {
    return this.moderation.softDeleteMessage(
      reportNumber,
      messageId,
      user.id,
      dto,
    );
  }

  @Patch(':reportNumber/messages/:messageId/pin')
  @RequirePermissions('reports.messages.pin')
  async pinMessage(
    @Param('reportNumber') reportNumber: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.pinMessage(reportNumber, messageId, user.id, true);
  }

  @Patch(':reportNumber/messages/:messageId/unpin')
  @RequirePermissions('reports.messages.unpin')
  async unpinMessage(
    @Param('reportNumber') reportNumber: string,
    @Param('messageId') messageId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.pinMessage(reportNumber, messageId, user.id, false);
  }

  @Post(':reportNumber/notes')
  @RequirePermissions('reports.notes')
  async createNote(
    @Param('reportNumber') reportNumber: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateModeratorNoteDto,
  ) {
    return this.moderation.createModeratorNote(reportNumber, user.id, dto);
  }

  @Patch(':reportNumber/notes/:noteId')
  @RequirePermissions('reports.notes')
  async updateNote(
    @Param('reportNumber') reportNumber: string,
    @Param('noteId') noteId: string,
    @Body() dto: UpdateModeratorNoteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.moderation.updateModeratorNote(
      reportNumber,
      noteId,
      dto,
      user.id,
    );
  }

  @Delete(':reportNumber/notes/:noteId')
  @RequirePermissions('reports.notes')
  async deleteNote(
    @Param('reportNumber') reportNumber: string,
    @Param('noteId') noteId: string,
  ) {
    return this.moderation.deleteModeratorNote(reportNumber, noteId);
  }

  @Patch(':reportNumber/notes/:noteId/pin')
  @RequirePermissions('reports.notes.pin')
  async pinNote(
    @Param('reportNumber') reportNumber: string,
    @Param('noteId') noteId: string,
    @Body() dto: PinModeratorNoteDto,
  ) {
    return this.moderation.pinModeratorNote(
      reportNumber,
      noteId,
      dto.pinned ?? true,
    );
  }

  /// Открепление заметки (то же право `reports.notes.pin`).
  @Delete(':reportNumber/notes/:noteId/pin')
  @RequirePermissions('reports.notes.pin')
  async unpinNote(
    @Param('reportNumber') reportNumber: string,
    @Param('noteId') noteId: string,
  ) {
    return this.moderation.pinModeratorNote(reportNumber, noteId, false);
  }

  @Post(':reportNumber/lock')
  @RequirePermissions('reports.lock')
  async lock(
    @Param('reportNumber') reportNumber: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: LockReportDto,
  ) {
    return this.moderation.lock(reportNumber, user.id, dto);
  }
}
