import { Module } from '@nestjs/common';
import { NewsAdminController } from './news-admin.controller';
import { NewsAdminService } from './news-admin.service';
import { NewsController } from './news.controller';
import { NewsModerationController } from './news-moderation.controller';
import { NewsService } from './news.service';
import { NewsScheduler } from './news.scheduler';

@Module({
  controllers: [NewsController, NewsAdminController, NewsModerationController],
  providers: [NewsService, NewsAdminService, NewsScheduler],
})
export class NewsModule {}
