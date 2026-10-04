import { INestApplicationContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';

/// CORS для всех Socket.IO namespace настраивается здесь централизованно
/// (через ConfigService, а не статическую опцию `cors` в @WebSocketGateway),
/// потому что декоратор гейтвея выполняется при импорте модуля — раньше,
/// чем AppModule успевает вызвать ConfigModule.forRoot() и заполнить env.
/// Один адаптер на всё приложение также исправляет S11 из старого проекта
/// (docs/technical/29-SECURITY.md): там namespace `/messages` был настроен
/// с cors.origin=true (любой origin) из-за рассинхронизации между гейтвеями.
export class ConfigurableIoAdapter extends IoAdapter {
  constructor(private readonly app: INestApplicationContext) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const config = this.app.get(ConfigService);
    return super.createIOServer(port, {
      ...options,
      cors: {
        origin: config.get<string>('WEB_ORIGIN'),
        credentials: true,
      },
    } as ServerOptions);
  }
}
