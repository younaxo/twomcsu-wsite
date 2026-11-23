import { Module } from '@nestjs/common';
import { MediaRequestsController } from './media-requests.controller';
import { UsersController } from './users.controller';
import { UsersSearchController } from './users-search.controller';
import { UsersSearchService } from './users-search.service';

@Module({
  controllers: [
    UsersSearchController,
    UsersController,
    MediaRequestsController,
  ],
  providers: [UsersSearchService],
})
export class UsersModule {}
