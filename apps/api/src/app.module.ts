import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { AchievementsModule } from './modules/achievements/achievements.module';
import { ActivityModule } from './modules/activity/activity.module';
import { AuthModule } from './modules/auth/auth.module';
import { AwardsModule } from './modules/awards/awards.module';
import { CommentsModule } from './modules/comments/comments.module';
import { ChatModule } from './modules/chat/chat.module';
import { CustomPositionsModule } from './modules/custom-positions/custom-positions.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DirectMessagesModule } from './modules/direct-messages/direct-messages.module';
import { EmailModule } from './modules/email/email.module';
import { EventsModule } from './modules/events/events.module';
import { FormsModule } from './modules/forms/forms.module';
import { FriendsModule } from './modules/friends/friends.module';
import { HealthModule } from './modules/health/health.module';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { NewsModule } from './modules/news/news.module';
import { MinecraftModule } from './modules/minecraft/minecraft.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PositionsModule } from './modules/positions/positions.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { ReportsModule } from './modules/reports/reports.module';
import { RolesModule } from './modules/roles/roles.module';
import { StoreModule } from './modules/store/store.module';
import { StreamingModule } from './modules/streaming/streaming.module';
import { TopicsModule } from './modules/topics/topics.module';
import { UsersModule } from './modules/users/users.module';
import { VotingModule } from './modules/voting/voting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validationSchema: envValidationSchema,
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
    PrismaModule,
    RedisModule,
    EmailModule,
    HealthModule,
    AuthModule,
    RolesModule,
    NotificationsModule,
    PositionsModule,
    DepartmentsModule,
    CustomPositionsModule,
    UsersModule,
    ProfilesModule,
    FriendsModule,
    CommentsModule,
    ActivityModule,
    DirectMessagesModule,
    ChatModule,
    NewsModule,
    EventsModule,
    TopicsModule,
    VotingModule,
    StreamingModule,
    FormsModule,
    ModerationModule,
    ReportsModule,
    StoreModule,
    MinecraftModule,
    AchievementsModule,
    AwardsModule,
    LeaderboardsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
