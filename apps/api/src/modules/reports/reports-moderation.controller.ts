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
import { AssignReportDto } from './dto/assign-report.dto';
import { ChangeReportStatusDto } from './dto/change-report-status.dto';
import { CreateModeratorNoteDto } from './dto/create-moderator-note.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
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
  async list(@Query() query: ListReportsQueryDto) {
    return this.moderation.listModeration(query);
  }

  @Patch(':reportNumber/assign')
  @RequirePermissions('reports.assign')
  async assign(
    @Param('reportNumber') reportNumber: string,
    @Body() dto: AssignReportDto,
  ) {
    return this.moderation.assign(reportNumber, dto);
  }

  @Patch(':reportNumber/status')
  @RequirePermissions('reports.status')
  async changeStatus(
    @Param('reportNumber') reportNumber: string,
    @Body() dto: ChangeReportStatusDto,
  ) {
    return this.moderation.changeStatus(reportNumber, dto);
  }

  @Patch(':reportNumber/verdict')
  @RequirePermissions('reports.verdict')
  async setVerdict(
    @Param('reportNumber') reportNumber: string,
    @Body() dto: SetVerdictDto,
  ) {
    return this.moderation.setVerdict(reportNumber, dto);
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
  ) {
    return this.moderation.updateModeratorNote(reportNumber, noteId, dto);
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
  ) {
    return this.moderation.pinModeratorNote(reportNumber, noteId, true);
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
