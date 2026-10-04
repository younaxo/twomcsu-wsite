import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { ArchiveReportDto } from './dto/archive-report.dto';
import { BanReportsDto } from './dto/ban-reports.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportsAdminService } from './reports-admin.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ReportsAdminController {
  constructor(private readonly admin: ReportsAdminService) {}

  @Get('reports/stats')
  @RequirePermissions('reports.stats')
  async stats() {
    return this.admin.stats();
  }

  @Get('reports/archived')
  @RequirePermissions('reports.archived.view')
  async listArchived(@Query() query: ListReportsQueryDto) {
    return this.admin.listArchived(query);
  }

  @Post('reports/:reportNumber/archive')
  @RequirePermissions('reports.archive')
  async archive(
    @Param('reportNumber') reportNumber: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ArchiveReportDto,
  ) {
    return this.admin.archiveReport(reportNumber, user.id, dto);
  }

  @Post('reports/:reportNumber/unarchive')
  @RequirePermissions('reports.unarchive')
  async unarchive(@Param('reportNumber') reportNumber: string) {
    return this.admin.unarchiveReport(reportNumber);
  }

  @Delete('reports/:reportNumber')
  @RequirePermissions('reports.delete')
  async remove(@Param('reportNumber') reportNumber: string) {
    await this.admin.deleteReport(reportNumber);
    return { success: true };
  }

  @Delete('reports/:reportNumber/messages/:messageId')
  @RequirePermissions('reports.messages')
  async hardDeleteMessage(
    @Param('reportNumber') reportNumber: string,
    @Param('messageId') messageId: string,
  ) {
    await this.admin.hardDeleteMessage(reportNumber, messageId);
    return { success: true };
  }

  @Post('reports/ban/:userId')
  @RequirePermissions('reports.ban')
  async banUser(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: BanReportsDto,
  ) {
    return this.admin.banUser(userId, user.id, dto);
  }

  @Delete('reports/ban/:userId')
  @RequirePermissions('reports.ban')
  async unbanUser(@Param('userId') userId: string) {
    await this.admin.unbanUser(userId);
    return { success: true };
  }

  @Get('support/donations')
  @RequirePermissions('support.donations.view')
  async listDonations(@Query() query: ListReportsQueryDto) {
    return this.admin.listDonations(query);
  }
}
