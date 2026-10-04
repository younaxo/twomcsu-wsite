import { Module } from '@nestjs/common';
import { PunishmentsController } from './punishments.controller';
import { PunishmentsService } from './punishments.service';
import { ReportsAdminController } from './reports-admin.controller';
import { ReportsAdminService } from './reports-admin.service';
import { ReportsModerationController } from './reports-moderation.controller';
import { ReportsModerationService } from './reports-moderation.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  controllers: [
    ReportsController,
    ReportsModerationController,
    ReportsAdminController,
    PunishmentsController,
  ],
  providers: [
    ReportsService,
    ReportsModerationService,
    ReportsAdminService,
    PunishmentsService,
  ],
})
export class ReportsModule {}
