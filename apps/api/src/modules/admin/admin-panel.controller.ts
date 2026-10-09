import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { SkipAudit } from '../audit/skip-audit.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { ListAdminOrdersQueryDto } from '../store/dto/list-admin-orders-query.dto';
import { AdminFinanceService } from './admin-finance.service';
import { AdminToolsService } from './admin-tools.service';
import { BookmarkDto } from './dto/bookmark.dto';
import { ExportOrdersDto } from './dto/export-orders.dto';
import { ExportService } from './export.service';
import { IpWhitelistDto } from './dto/ip-whitelist.dto';
import { ReorderBookmarksDto } from './dto/reorder-bookmarks.dto';
import { SavedFilterDto } from './dto/saved-filter.dto';
import { ScheduledExportDto } from './dto/scheduled-export.dto';
import { sendCsv } from './csv.util';
import { UpdateBookmarkDto } from './dto/update-bookmark.dto';
import { UpdateSavedFilterDto } from './dto/update-saved-filter.dto';
import { UpdateScheduledExportDto } from './dto/update-scheduled-export.dto';
import { UpdateSiteSettingsDto } from './dto/update-site-settings.dto';
import { UserIdFilterQueryDto } from './dto/user-id-filter-query.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminPanelController {
  constructor(
    private readonly tools: AdminToolsService,
    private readonly finance: AdminFinanceService,
    private readonly exportService: ExportService,
  ) {}

  // --- Saved filters ------------------------------------------------------

  @Get('saved-filters')
  @RequirePermissions('saved_filters.view')
  async savedFilters(
    @CurrentUser() admin: AuthenticatedUser,
    @Query('page') page?: string,
  ) {
    return this.tools.listSavedFilters(admin.id, page);
  }

  @Post('saved-filters')
  @RequirePermissions('saved_filters.create')
  async createSavedFilter(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: SavedFilterDto,
  ) {
    return this.tools.createSavedFilter(admin.id, dto);
  }

  @Patch('saved-filters/:id')
  @RequirePermissions('saved_filters.edit')
  async updateSavedFilter(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateSavedFilterDto,
  ) {
    return this.tools.updateSavedFilter(id, admin.id, dto);
  }

  @Delete('saved-filters/:id')
  @RequirePermissions('saved_filters.delete')
  async deleteSavedFilter(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.tools.deleteSavedFilter(id, admin.id);
  }

  // --- Bookmarks ------------------------------------------------------------

  @Get('bookmarks')
  @RequirePermissions('bookmarks.view')
  async bookmarks(@CurrentUser() admin: AuthenticatedUser) {
    return this.tools.listBookmarks(admin.id);
  }

  @Post('bookmarks')
  @RequirePermissions('bookmarks.create')
  async createBookmark(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: BookmarkDto,
  ) {
    return this.tools.createBookmark(admin.id, dto);
  }

  @Patch('bookmarks/:id')
  @RequirePermissions('bookmarks.edit')
  async updateBookmark(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateBookmarkDto,
  ) {
    return this.tools.updateBookmark(id, admin.id, dto);
  }

  @Delete('bookmarks/:id')
  @RequirePermissions('bookmarks.delete')
  async deleteBookmark(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.tools.deleteBookmark(id, admin.id);
  }

  @Post('bookmarks/reorder')
  @RequirePermissions('bookmarks.reorder')
  async reorderBookmarks(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ReorderBookmarksDto,
  ) {
    return this.tools.reorderBookmarks(admin.id, dto);
  }

  // --- Scheduled exports ----------------------------------------------------

  @Get('exports/scheduled')
  @RequirePermissions('exports.scheduled.view')
  async scheduledExports(@CurrentUser() admin: AuthenticatedUser) {
    return this.tools.listScheduledExports(admin.id);
  }

  @Post('exports/scheduled')
  @RequirePermissions('exports.scheduled.create')
  async createScheduled(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: ScheduledExportDto,
  ) {
    return this.tools.createScheduledExport(admin.id, dto);
  }

  @Patch('exports/scheduled/:id')
  @RequirePermissions('exports.scheduled.edit')
  async updateScheduled(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: UpdateScheduledExportDto,
  ) {
    return this.tools.updateScheduledExport(id, admin.id, dto);
  }

  @Delete('exports/scheduled/:id')
  @RequirePermissions('exports.scheduled.delete')
  async deleteScheduled(
    @Param('id') id: string,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.tools.deleteScheduledExport(id, admin.id);
  }

  // --- Структурированные настройки сайта -----------------------------------

  @Get('settings/site')
  @RequirePermissions('settings.site.view')
  async siteSettings() {
    return this.tools.getSiteSettings();
  }

  @Patch('settings/site')
  @RequirePermissions('settings.site.edit')
  @SkipAudit()
  async updateSiteSettings(
    @Body() dto: UpdateSiteSettingsDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.tools.updateSiteSettings(dto, admin.id);
  }

  // --- Security ---------------------------------------------------------------

  @Get('security/sessions')
  @RequirePermissions('security.sessions.view')
  async sessions(@Query() query: UserIdFilterQueryDto) {
    return this.tools.listActiveSessions(query);
  }

  @Get('security/suspicious')
  @RequirePermissions('security.suspicious.view')
  async suspicious() {
    return this.tools.listSuspiciousActivity();
  }

  @Get('security/logins')
  @RequirePermissions('security.logins.view')
  async logins(@Query() query: UserIdFilterQueryDto) {
    return this.tools.listLoginHistory(query);
  }

  @Post('security/ip-whitelist')
  @RequirePermissions('security.ip_whitelist.create')
  @SkipAudit()
  async ipWhitelist(
    @Body() dto: IpWhitelistDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    return this.tools.updateIpWhitelist(dto, admin.id);
  }

  // --- Content / Finance ----------------------------------------------------

  @Get('content/dashboard')
  @RequirePermissions('content.view')
  async contentDashboard() {
    return this.finance.getContentDashboard();
  }

  @Get('finance/overview')
  @RequirePermissions('finance.overview.view')
  async financeOverview() {
    return this.finance.getFinanceOverview();
  }

  @Get('finance/transactions')
  @RequirePermissions('finance.transactions.view')
  async financeTransactions(@Query() query: ListAdminOrdersQueryDto) {
    return this.finance.listTransactions(query);
  }

  @Get('finance/refunds')
  @RequirePermissions('finance.refunds.view')
  async financeRefunds(@Query() query: ListAdminOrdersQueryDto) {
    return this.finance.listRefunds(query);
  }

  @Post('finance/export')
  @RequirePermissions('finance.export')
  async financeExport(@Body() dto: ExportOrdersDto, @Res() res: Response) {
    sendCsv(res, await this.exportService.exportOrders(dto));
  }
}
