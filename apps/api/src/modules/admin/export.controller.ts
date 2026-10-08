import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { sendCsv } from './csv.util';
import { ExportAuditDto } from './dto/export-audit.dto';
import { ExportNewsDto } from './dto/export-news.dto';
import { ExportOrdersDto } from './dto/export-orders.dto';
import { ExportReportsDto } from './dto/export-reports.dto';
import { ExportUsersDto } from './dto/export-users.dto';
import { ExportService } from './export.service';

@Controller('admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExportController {
  constructor(private readonly exportService: ExportService) {}

  @Post('users/export')
  @RequirePermissions('users.export')
  async exportUsers(@Body() dto: ExportUsersDto, @Res() res: Response) {
    sendCsv(res, await this.exportService.exportUsers(dto));
  }

  @Post('orders/export')
  @RequirePermissions('orders.export')
  async exportOrders(@Body() dto: ExportOrdersDto, @Res() res: Response) {
    sendCsv(res, await this.exportService.exportOrders(dto));
  }

  @Post('reports/export')
  @RequirePermissions('reports.export')
  async exportReports(@Body() dto: ExportReportsDto, @Res() res: Response) {
    sendCsv(res, await this.exportService.exportReports(dto));
  }

  @Post('news/export')
  @RequirePermissions('news.export')
  async exportNews(@Body() dto: ExportNewsDto, @Res() res: Response) {
    sendCsv(res, await this.exportService.exportNews(dto));
  }

  @Post('audit-log/export')
  @RequirePermissions('audit_log.export')
  async exportAudit(@Body() dto: ExportAuditDto, @Res() res: Response) {
    sendCsv(res, await this.exportService.exportAuditLog(dto));
  }
}
