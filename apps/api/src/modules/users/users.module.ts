import { Module } from '@nestjs/common';
import { MediaRequestsController } from './media-requests.controller';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController, MediaRequestsController],
})
export class UsersModule {}
