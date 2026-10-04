import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';

@Module({
  imports: [FriendsModule],
  controllers: [CommentsController],
  providers: [CommentsService],
})
export class CommentsModule {}
