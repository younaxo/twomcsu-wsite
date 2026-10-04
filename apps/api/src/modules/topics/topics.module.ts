import { Module } from '@nestjs/common';
import { TopicsAdminController } from './topics-admin.controller';
import { TopicsAdminService } from './topics-admin.service';
import { TopicsController } from './topics.controller';
import { TopicsService } from './topics.service';

@Module({
  controllers: [TopicsController, TopicsAdminController],
  providers: [TopicsService, TopicsAdminService],
})
export class TopicsModule {}
