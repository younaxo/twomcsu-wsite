import { Module } from '@nestjs/common';
import { EventsAdminController } from './events-admin.controller';
import { EventsAdminService } from './events-admin.service';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';

@Module({
  controllers: [EventsController, EventsAdminController],
  providers: [EventsService, EventsAdminService],
})
export class EventsModule {}
