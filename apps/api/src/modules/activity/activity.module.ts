import { Module } from '@nestjs/common';
import { FriendsModule } from '../friends/friends.module';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';

@Module({
  imports: [FriendsModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
