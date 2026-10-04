import { IsIn, IsString } from 'class-validator';

/// Как и VoteWebhookDto (ADR-0025) — секрет внутри тела запроса, а не в
/// заголовке/HMAC над сырым телом: проще и достаточно для единственного
/// глобального секрета (PAYMENT_WEBHOOK_SECRET), сравнение — constant-time.
export class PaymentWebhookDto {
  @IsString()
  secret!: string;

  @IsString()
  orderNumber!: string;

  @IsString()
  paymentId!: string;

  @IsIn(['succeeded', 'failed'])
  status!: 'succeeded' | 'failed';
}
