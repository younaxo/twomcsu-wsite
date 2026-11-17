import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { NestExpressApplication } from '@nestjs/platform-express';
import { resolve } from 'path';
import { allowedOrigins, corsOrigin } from './config/cors';
import { normalizeIp, resolveTrustProxy } from './config/trust-proxy';
import { ConfigurableIoAdapter } from './websocket-adapter';

/// Опции создания приложения для main.ts и e2e (`createNestApplication`):
/// `rawBody` нужен для проверки HMAC платёжного вебхука (ADR-0157).
export const APP_CREATE_OPTIONS = { rawBody: true } as const;

/// Общая настройка приложения — используется и в main.ts (реальный запуск),
/// и в e2e-тестах (Test.createTestingModule не прогоняет main.ts). Если
/// добавлять middleware/pipes только в main.ts, e2e-тесты будут тестировать
/// другое приложение (без cookie-parser/ValidationPipe/helmet/WS-адаптера).
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Политика доверия к прокси (ADR-0155) — до любых middleware, читающих req.ip.
  const express = app as NestExpressApplication;
  express.set(
    'trust proxy',
    resolveTrustProxy(config.get<string>('TRUST_PROXY')),
  );
  // Единый клиентский IP для throttler, brute-force, audit, сессий и форм:
  // `::ffff:1.2.3.4` → `1.2.3.4`.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    Object.defineProperty(req, 'ip', {
      value: normalizeIp(req.ip),
      configurable: true,
      enumerable: true,
      writable: true,
    });
    next();
  });

  app.use(helmet());
  app.use(cookieParser());
  // Явный allowlist origin'ов сайта (ADR-0104), без «*»; тот же — у Socket.IO.
  app.enableCors({
    origin: corsOrigin(allowedOrigins(config)),
    credentials: true,
    // Retry-After (429/503) должен быть виден браузеру на запросах web -> api.
    exposedHeaders: ['Retry-After'],
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
