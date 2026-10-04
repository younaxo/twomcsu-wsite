import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { BruteForceService } from './brute-force.service';
import { CaptchaService } from './captcha.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_ACCESS_SECRET'),
        signOptions: {
          expiresIn: config.get<string>('JWT_ACCESS_EXPIRES', '15m'),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, BruteForceService, CaptchaService],
  // JwtModule экспортируется, чтобы WS-шлюзы (например DirectMessagesGateway)
  // могли проверять access-token из handshake тем же JwtService, не
  // регистрируя JwtModule повторно со своим конфигом. CaptchaService —
  // чтобы FormsService мог проверять hCaptcha для анонимных ответов
  // (Form.requiresCaptcha), не дублируя hCaptcha-интеграцию.
  exports: [AuthService, JwtModule, CaptchaService],
})
export class AuthModule {}
