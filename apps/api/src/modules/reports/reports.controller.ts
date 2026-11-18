import {
  Body,
  Controller,
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
import { ConfigService } from '@nestjs/config';
import { isAdmin2faDenied } from '../roles/guards/permissions.guard';
import { PermissionService } from '../roles/permission.service';
import { AddReportMessageDto } from './dto/add-report-message.dto';
import { CreateDonationProblemDto } from './dto/create-donation-problem.dto';
import { CreateReportDto } from './dto/create-report.dto';
import { ListReportsQueryDto } from './dto/list-reports-query.dto';
import { ReportHistoryQueryDto } from './dto/report-history-query.dto';
import { ReportRulesQueryDto } from './dto/report-rules-query.dto';
import { UpdateOwnReportMessageDto } from './dto/update-own-report-message.dto';
import { ReportsService } from './reports.service';
import { SiteModule } from '../system/site-module.decorator';

@SiteModule('reports')
@Controller()
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {}

  @Get('reports/rules')
  async getRules(@Query() query: ReportRulesQueryDto) {
    return this.reports.getRules(query.type);
  }

  @Get('reports')
  async listMine(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListReportsQueryDto,
  ) {
    return this.reports.listMine(user.id, query);
  }

  @Get('reports/:reportNumber')
  async getOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportNumber') reportNumber: string,
  ) {
    const isStaff = await this.permissions.hasPermission(
      user.id,
      'reports.view',
    );
    // ADR-0169: доступ к чужому обращению по праву персонала — действие
    // администрации, требует 2FA. Автор без 2FA читает своё обращение как игрок.
    const staff2faDenied = isStaff && isAdmin2faDenied(user, this.config);
    return this.reports.getByNumber(
      reportNumber,
      user.id,
      isStaff && !staff2faDenied,
      staff2faDenied,
    );
  }

  @Get('reports/:reportNumber/history')
  async history(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportNumber') reportNumber: string,
    @Query() query: ReportHistoryQueryDto,
  ) {
    return this.reports.historyForAuthor(reportNumber, user.id, query);
  }

  @Post('reports')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
  ) {
    return this.reports.createReport(user.id, dto);
  }

  @Post('reports/:reportNumber/messages')
  async addMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportNumber') reportNumber: string,
    @Body() dto: AddReportMessageDto,
  ) {
    return this.reports.addMessage(reportNumber, user.id, dto);
  }

  @Patch('reports/:reportNumber/messages/:messageId')
  async updateOwnMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('reportNumber') reportNumber: string,
    @Param('messageId') messageId: string,
    @Body() dto: UpdateOwnReportMessageDto,
  ) {
    return this.reports.updateOwnMessage(reportNumber, user.id, messageId, dto);
  }

  @Post('support/donation-problem')
  async donationProblem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDonationProblemDto,
  ) {
    return this.reports.createDonationProblem(user.id, dto);
  }
}
