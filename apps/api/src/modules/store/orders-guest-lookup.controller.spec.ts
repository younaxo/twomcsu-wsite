import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StoreExtrasController } from './orders.controller';
import { GuestOrderLookupDto } from './dto/guest-order-lookup.dto';

describe('POST store/orders/guest/lookup (0.12a)', () => {
  const handler = StoreExtrasController.prototype.guestOrder;

  it('лимит 60 запросов в минуту (ADR-0186 п. 4)', () => {
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
  });

  it('DTO не отсекает неверный формат токена (сервис отвечает единым 404)', async () => {
    const dto = plainToInstance(GuestOrderLookupDto, { token: 'bad token!' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('DTO: не строка и слишком длинное значение — 400', async () => {
    expect(
      await validate(plainToInstance(GuestOrderLookupDto, { token: 5 })),
    ).not.toHaveLength(0);
    expect(
      await validate(
        plainToInstance(GuestOrderLookupDto, { token: 'a'.repeat(513) }),
      ),
    ).not.toHaveLength(0);
  });
});
