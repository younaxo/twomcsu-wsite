import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import {
  AnnouncementsAdminController,
  PublicAnnouncementsController,
} from './announcements.controller';
import { AnnouncementsScheduler } from './announcements.scheduler';
import { AnnouncementsService } from './announcements.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { MailingsScheduler } from './mailings.scheduler';
import { MailingsService } from './mailings.service';

/// Коммуникации от имени сайта: системные сообщения (ADR-0080), объявления
/// (ADR-0081).
@Module({
  imports: [NotificationsModule],
  controllers: [
    CommunicationsController,
    AnnouncementsAdminController,
    PublicAnnouncementsController,
  ],
  providers: [
    CommunicationsService,
    AnnouncementsService,
    AnnouncementsScheduler,
    MailingsService,
    MailingsScheduler,
  ],
  exports: [AnnouncementsService],
})
export class CommunicationsModule {}
