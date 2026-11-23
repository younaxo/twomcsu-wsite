import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PERMISSIONS_KEY } from '../roles/decorators/require-permissions.decorator';
import { BundlesAdminController } from './bundles-admin.controller';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

const VALID_ITEMS = [{ productId: 'p1', quantity: 1 }];

describe('BundlesService.listAdmin', () => {
  function build(items: unknown[], total: number) {
    const prisma = {
      bundle: {
        findMany: jest.fn().mockResolvedValue(items),
        count: jest.fn().mockResolvedValue(total),
      },
    };
    return {
      prisma,
      service: new BundlesService(prisma as never),
    };
  }

  it('без фильтра по активности и сроку, с пагинацией и составом', async () => {
    const { prisma, service } = build([{ id: 'b1', isActive: false }], 41);
    const result = await service.listAdmin({ page: 2, limit: 20 });
    const args = prisma.bundle.findMany.mock.calls[0][0];
    expect(args.where).toBeUndefined();
    expect(args.skip).toBe(20);
    expect(args.take).toBe(20);
    expect(args.include).toEqual({ items: { include: { product: true } } });
    expect(prisma.bundle.count).toHaveBeenCalledWith();
    expect(result).toEqual({
      items: [{ id: 'b1', isActive: false }],
      total: 41,
      page: 2,
      limit: 20,
    });
  });

  it('значения по умолчанию: страница 1, лимит 30', async () => {
    const { prisma, service } = build([], 0);
    const result = await service.listAdmin({});
    expect(prisma.bundle.findMany.mock.calls[0][0]).toMatchObject({
      skip: 0,
      take: 30,
    });
    expect(result).toMatchObject({ page: 1, limit: 30 });
  });
});

describe('BundlesAdminController: права', () => {
  it('список требует store.bundles.view', () => {
    const keys = Reflect.getMetadata(
      PERMISSIONS_KEY,
      BundlesAdminController.prototype.listAdmin,
    );
    expect(keys).toEqual(['store.bundles.view']);
  });
});

describe('image в DTO наборов (как у товаров)', () => {
  const base = { name: 'N', slug: 'n', totalPrice: 1, originalPrice: 2 };

  it('Create: хост из белого списка проходит и нормализуется', async () => {
    const dto = plainToInstance(CreateBundleDto, {
      ...base,
      items: VALID_ITEMS,
      image: 'https://CDN-files.twomc.su/store/a.webp',
    });
    expect(await validate(dto)).toHaveLength(0);
    expect(dto.image).toBe('https://cdn-files.twomc.su/store/a.webp');
  });

  it.each([
    'http://cdn-files.twomc.su/a.webp',
    'https://evil.example.com/a.webp',
    'https://cdn-files.twomc.su@evil.com/a.webp',
    'javascript:alert(1)',
  ])('Create: отклоняет %s', async (image) => {
    const dto = plainToInstance(CreateBundleDto, {
      ...base,
      items: VALID_ITEMS,
      image,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('image');
  });

  it('Update: отклоняет чужой хост, пропускает белый список и отсутствие поля', async () => {
    const bad = plainToInstance(UpdateBundleDto, {
      image: 'https://evil.example.com/a.webp',
    });
    expect((await validate(bad)).map((e) => e.property)).toContain('image');
    const good = plainToInstance(UpdateBundleDto, {
      image: 'https://minotar.net/helm/Steve',
    });
    expect(await validate(good)).toHaveLength(0);
    expect(await validate(plainToInstance(UpdateBundleDto, {}))).toHaveLength(
      0,
    );
  });
});
