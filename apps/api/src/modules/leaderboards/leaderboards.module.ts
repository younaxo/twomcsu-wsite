import { Module } from '@nestjs/common';
import { LeaderboardsController } from './leaderboards.controller';
import { LeaderboardsService } from './leaderboards.service';
import { StatsSettingsService } from './stats-settings.service';

@Module({
  controllers: [LeaderboardsController],
  providers: [LeaderboardsService, StatsSettingsService],
  exports: [LeaderboardsService, StatsSettingsService],
})
export class LeaderboardsModule {}
