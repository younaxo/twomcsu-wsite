import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';

/// Общая настройка приложения — используется и в main.ts (реальный запуск),
/// и в e2e-тестах (Test.createTestingModule не прогоняет main.ts). Если
/// добавлять middleware/pipes только в main.ts, e2e-тесты будут тестировать
/// другое приложение (без cookie-parser/ValidationPipe/helmet).
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.get<string>('WEB_ORIGIN'),
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
}
