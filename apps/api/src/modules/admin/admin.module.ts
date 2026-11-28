import { Module } from '@nestjs/common';
import { DeliveryModule } from '../delivery/delivery.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ModerationModule } from '../moderation/moderation.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { StoreModule } from '../store/store.module';
import { AdminController } from './admin.controller';
import { AdminFinanceService } from './admin-finance.service';
import { AdminPlayersController } from './admin-players.controller';
import { AdminPlayersService } from './admin-players.service';
import { AdminPanelController } from './admin-panel.controller';
import { AdminToolsService } from './admin-tools.service';
import { SiteSocialLinksService } from './site-social-links.service';
import { AdminUsersBulkController } from './admin-users-bulk.controller';
import { AdminUsersBulkService } from './admin-users-bulk.service';
import { DashboardService } from './dashboard.service';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { SiteController } from './site.controller';

@Module({
  imports: [
    DeliveryModule,
    InventoryModule,
    ModerationModule,
    NotificationsModule,
    StoreModule,
  ],
  controllers: [
    AdminController,
    AdminPlayersController,
    AdminPanelController,
    AdminUsersBulkController,
    ExportController,
    SiteController,
  ],
  providers: [
    DashboardService,
    AdminToolsService,
    SiteSocialLinksService,
    AdminFinanceService,
    AdminPlayersService,
    AdminUsersBulkService,
    ExportService,
  ],
})
export class AdminModule {}
