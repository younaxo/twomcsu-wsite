import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { ContentReportsService } from './content-reports.service';
import { ListCommentReportsQueryDto } from './dto/list-comment-reports-query.dto';
import { ListProfileReportsQueryDto } from './dto/list-profile-reports-query.dto';
import { ReviewContentReportDto } from './dto/review-content-report.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContentReportsController {
  constructor(private readonly reports: ContentReportsService) {}

  @Get('comment-reports')
  @RequirePermissions('comment_reports.view')
  async listCommentReports(@Query() query: ListCommentReportsQueryDto) {
    return this.reports.listCommentReports(query.status);
  }

  @Patch('comment-reports/:id')
  @RequirePermissions('comment_reports.edit')
  async reviewCommentReport(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewContentReportDto,
  ) {
    return this.reports.reviewCommentReport(id, user.id, dto);
  }

  @Get('profile-reports')
  @RequirePermissions('profile_reports.view')
  async listProfileReports(@Query() query: ListProfileReportsQueryDto) {
    return this.reports.listProfileReports(query.status);
  }

  @Patch('profile-reports/:id')
  @RequirePermissions('profile_reports.edit')
  async reviewProfileReport(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ReviewContentReportDto,
  ) {
    return this.reports.reviewProfileReport(id, user.id, dto);
  }
}
