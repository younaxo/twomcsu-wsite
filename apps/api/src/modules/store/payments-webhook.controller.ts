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
import { Request } from 'express';
import { OrdersService } from './orders.service';
import { PaymentProviderRegistry } from './payment/payment-provider.registry';

/// ADR-0157: подпись проверяется провайдером из `:provider` над сырым телом
/// (`rawBody: true` в main.ts/e2e через APP_CREATE_OPTIONS); неизвестный
/// провайдер — 404, неверная/отсутствующая подпись — 401.
@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(
    private readonly orders: OrdersService,
    private readonly registry: PaymentProviderRegistry,
  ) {}

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
