import {
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  RawBodyRequest,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';

/// Отдельный лимит вебхука (R29, ADR-0187): провайдеры ретраят не-2xx, глобальные
/// 100/мин на IP их бы душили. Лимит выше, но конечен (защита от флуда с
/// неверной подписью); 429 провайдер тоже ретраит.
export const WEBHOOK_RATE_LIMIT = { limit: 600, ttl: 60_000 } as const;

/// ADR-0157: подпись проверяется провайдером из `:provider` над сырым телом
/// (`rawBody: true` в main.ts/e2e через APP_CREATE_OPTIONS); неизвестный
/// провайдер — 404, неверная/отсутствующая подпись — 401.
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(
    private readonly orders: OrdersService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

  @Throttle({ default: WEBHOOK_RATE_LIMIT })
  @HttpCode(HttpStatus.OK)
  @Post(':provider')
  async handle(
    @Param('provider') providerName: string,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const provider = this.registry.get(providerName);
    if (!provider) {
      throw new NotFoundException('Платёжный провайдер не найден');
    }
    const event = provider.verifyWebhook(req.rawBody, req.headers);
    if (!event) {
      throw new UnauthorizedException('Неверная подпись вебхука');
    }
    return this.orders.handleWebhook(provider, event);
  }
}
