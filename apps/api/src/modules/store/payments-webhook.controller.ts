import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { PaymentWebhookDto } from './dto/payment-webhook.dto';
import { OrdersService } from './orders.service';

@Controller('webhooks/payments')
export class PaymentsWebhookController {
  constructor(private readonly orders: OrdersService) {}

  @HttpCode(HttpStatus.OK)
  @Post(':provider')
  async handle(
    @Param('provider') _provider: string,
    @Body() dto: PaymentWebhookDto,
  ) {
    return this.orders.handleWebhook(dto);
  }
}
