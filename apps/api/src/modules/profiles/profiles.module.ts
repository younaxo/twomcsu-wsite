import { Module } from '@nestjs/common';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';

@Module({
  imports: [LeaderboardsModule],
  controllers: [ProfilesController],
  providers: [ProfilesService],
})
export class ProfilesModule {}
