import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { envValidationSchema } from './config/env.validation';
import { ActivityModule } from './modules/activity/activity.module';
import { AuthModule } from './modules/auth/auth.module';
import { CommentsModule } from './modules/comments/comments.module';
import { CustomPositionsModule } from './modules/custom-positions/custom-positions.module';
import { DepartmentsModule } from './modules/departments/departments.module';
import { DirectMessagesModule } from './modules/direct-messages/direct-messages.module';
import { EmailModule } from './modules/email/email.module';
import { FriendsModule } from './modules/friends/friends.module';
import { HealthModule } from './modules/health/health.module';
import { PositionsModule } from './modules/positions/positions.module';
import { ProfilesModule } from './modules/profiles/profiles.module';
import { PrismaModule } from './modules/prisma/prisma.module';
import { RedisModule } from './modules/redis/redis.module';
import { RolesModule } from './modules/roles/roles.module';
import { UsersModule } from './modules/users/users.module';

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
    PositionsModule,
    DepartmentsModule,
    CustomPositionsModule,
    UsersModule,
    ProfilesModule,
    FriendsModule,
    CommentsModule,
    ActivityModule,
    DirectMessagesModule,
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
