import { Module } from '@nestjs/common';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StoreModule } from '../store/store.module';
import { AdminController } from './admin.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminPanelController } from './admin-panel.controller';
import { AdminToolsService } from './admin-tools.service';
import { AdminUsersBulkController } from './admin-users-bulk.controller';
import { AdminUsersBulkService } from './admin-users-bulk.service';
import { AuditService } from './audit.service';
import { DashboardService } from './dashboard.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { SiteController } from './site.controller';

@Module({
  imports: [ModerationModule, NotificationsModule, StoreModule],
  controllers: [
    AdminController,
    AdminPanelController,
    AdminUsersBulkController,
    ExportController,
    SiteController,
  ],
  providers: [
    AuditService,
    DashboardService,
    AdminToolsService,
    AdminFinanceService,
    AdminUsersBulkService,
    ExportService,
  ],
  exports: [AuditService],
})
export class AdminModule {}
