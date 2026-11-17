import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { APP_CREATE_OPTIONS, configureApp } from './configure-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, APP_CREATE_OPTIONS);
  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<number>('API_PORT', 4000);
  await app.listen(port);
}
bootstrap();
