import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { ConfigurableIoAdapter } from './websocket-adapter';

/// Общая настройка приложения — используется и в main.ts (реальный запуск),
/// и в e2e-тестах (Test.createTestingModule не прогоняет main.ts). Если
/// добавлять middleware/pipes только в main.ts, e2e-тесты будут тестировать
/// другое приложение (без cookie-parser/ValidationPipe/helmet/WS-адаптера).
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
  app.useWebSocketAdapter(new ConfigurableIoAdapter(app));

  // Локальный драйвер хранилища (dev/тесты): файлы отдаются самим API по
  // /uploads; в production за cdn-files.twomc.su стоит S3/отдельный слой.
  if ((config.get<string>('STORAGE_DRIVER') ?? 'local') === 'local') {
    const express = app as NestExpressApplication;
    if (typeof express.useStaticAssets === 'function') {
      express.useStaticAssets(
        resolve(
          process.cwd(),
          config.get<string>('UPLOADS_DIR') ?? './uploads',
        ),
        {
          prefix: '/uploads',
          maxAge: '7d',
          immutable: true,
          index: false,
          // express static не знает image/avif — выставляем явно.
          setHeaders: (res, path) => {
            if (path.endsWith('.avif')) {
              res.setHeader('Content-Type', 'image/avif');
            }
            // helmet по умолчанию ставит CORP same-origin — тогда сайт
            // (другой origin) не может показать аватар/баннер. Публичные
            // загрузки — cross-origin (ADR-0088).
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          },
        },
      );
    }
  }
}
