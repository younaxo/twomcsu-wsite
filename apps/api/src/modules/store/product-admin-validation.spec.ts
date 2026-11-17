import { ProductType } from '@prisma/client';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateVariantDto } from './dto/create-variant.dto';
import { PRICE_STRING } from './dto/price-string';
import { UpdateProductDto } from './dto/update-product.dto';
import { isAllowedProductImageUrl } from './product-image-url';
import { DEFAULT_SELLABLE_TYPES, isSellableType } from './sellable-types';

describe('isAllowedProductImageUrl (S2)', () => {
  it.each([
    'https://cdn-files.twomc.su/store/products/a.webp',
    'https://mc-heads.net/avatar/Steve',
    'https://minotar.net/helm/Steve',
  ])('пропускает %s', (url) => {
    expect(isAllowedProductImageUrl(url)).toBe(true);
  });

  it.each([
    'http://cdn-files.twomc.su/a.webp',
    'https://evil.example.com/a.webp',
    'https://cdn-files.twomc.su.evil.com/a.webp',
    'https://cdn-files.twomc.su@evil.com/a.webp',
    'https://user:pass@cdn-files.twomc.su/a.webp',
    'https://cdn-files.twomc.su:8443/a.webp',
    'javascript:alert(1)',
    'data:image/png;base64,AAAA',
    '//cdn-files.twomc.su/a.webp',
    '/uploads/a.webp',
    '',
    'не ссылка',
  ])('отклоняет %s', (url) => {
    expect(isAllowedProductImageUrl(url)).toBe(false);
  });

  it('отклоняет не строку', () => {
    expect(isAllowedProductImageUrl(123)).toBe(false);
    expect(isAllowedProductImageUrl(null)).toBe(false);
  });
});

describe('цена — Decimal-строка', () => {
  it.each(['0', '39', '199.00', '1499.9', '99999999.99'])(
    'принимает %s',
    (v) => {
      expect(PRICE_STRING.test(v)).toBe(true);
    },
  );
  it.each(['-1', '1e3', '1.234', '.5', '1,5', '100000000', 'abc', ''])(
    'отклоняет "%s"',
    (v) => {
      expect(PRICE_STRING.test(v)).toBe(false);
    },
  );

  it('число (float) в DTO варианта отклоняется', async () => {
    const dto = plainToInstance(CreateVariantDto, {
      duration: 'MONTH_1',
      price: 19.99,
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'price')).toBe(true);
  });

  it('строка в DTO варианта принимается', async () => {
    const dto = plainToInstance(CreateVariantDto, {
      duration: 'MONTH_1',
      price: '19.99',
      oldPrice: '29.00',
    });
    expect(await validate(dto)).toHaveLength(0);
  });
});

describe('UpdateProductDto', () => {
  it('поле gameCommands не входит в DTO (whitelist + forbidNonWhitelisted даст 400)', async () => {
    const dto = plainToInstance(UpdateProductDto, { gameCommands: ['op x'] });
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    expect(errors.some((e) => e.property === 'gameCommands')).toBe(true);
  });

  it('картинка вне белого списка отклоняется, из белого — принимается', async () => {
    const bad = plainToInstance(UpdateProductDto, {
      image: 'https://evil.example.com/a.png',
    });
    expect((await validate(bad)).some((e) => e.property === 'image')).toBe(
      true,
    );
    const ok = plainToInstance(UpdateProductDto, {
      image: 'https://cdn-files.twomc.su/a.png',
      images: ['https://cdn-files.twomc.su/b.png'],
    });
    expect(await validate(ok)).toHaveLength(0);
    const badList = plainToInstance(UpdateProductDto, {
      images: ['https://cdn-files.twomc.su/b.png', 'http://x.y/z.png'],
    });
    expect((await validate(badList)).some((e) => e.property === 'images')).toBe(
      true,
    );
  });
});

describe('закрытый список продаваемых типов (ADR-0185)', () => {
  it('по умолчанию — 6 типов слоя 0', () => {
    expect([...DEFAULT_SELLABLE_TYPES].sort()).toEqual(
      [
        ProductType.BATTLE_PASS,
        ProductType.CURRENCY,
        ProductType.KEY,
        ProductType.PRIVILEGE,
        ProductType.UNBAN,
        ProductType.UNMUTE,
      ].sort(),
    );
  });
  it.each([
    ProductType.BADGE,
    ProductType.DECORATION,
    ProductType.SUBSCRIPTION,
    ProductType.BATTLE_PASS_BOOSTER,
    ProductType.BUNDLE,
  ])('%s не продаётся', (type) => {
    expect(isSellableType(type)).toBe(false);
  });
});
