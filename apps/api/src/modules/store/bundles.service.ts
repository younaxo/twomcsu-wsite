import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { ListAdminBundlesQueryDto } from './dto/list-admin-bundles-query.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';
import { PUBLIC_PRODUCT_BRIEF_SELECT } from './public-product';

const BUNDLE_INCLUDE = {
  items: { include: { product: true } },
} as const;

/// Публичный вид набора: товары — по белому списку полей (без gameCommands и
/// прочих служебных). BUNDLE_INCLUDE остаётся для админских ответов.
const PUBLIC_BUNDLE_INCLUDE = {
  items: {
    select: {
      id: true,
      bundleId: true,
      productId: true,
      variantId: true,
      quantity: true,
      product: { select: PUBLIC_PRODUCT_BRIEF_SELECT },
    },
  },
} as const;

@Injectable()
export class BundlesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const now = new Date();
    return this.prisma.bundle.findMany({
      where: {
        isActive: true,
        AND: [
          { OR: [{ validFrom: null }, { validFrom: { lte: now } }] },
          { OR: [{ validUntil: null }, { validUntil: { gte: now } }] },
        ],
      },
      include: PUBLIC_BUNDLE_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
  }

  async listAdmin(query: ListAdminBundlesQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 30;
    const [items, total] = await Promise.all([
      this.prisma.bundle.findMany({
        include: BUNDLE_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.bundle.count(),
    ]);
    return { items, total, page, limit };
  }

  async getBySlug(slug: string) {
    const bundle = await this.prisma.bundle.findUnique({
      where: { slug },
      include: PUBLIC_BUNDLE_INCLUDE,
    });
    if (!bundle || !bundle.isActive) {
      throw new NotFoundException('Набор не найден');
    }
    return bundle;
  }

  private async requireBundle(id: string) {
    const bundle = await this.prisma.bundle.findUnique({ where: { id } });
    if (!bundle) {
      throw new NotFoundException('Набор не найден');
    }
    return bundle;
  }

  async create(dto: CreateBundleDto) {
    const existing = await this.prisma.bundle.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Набор с таким slug уже существует');
    }
    const { items, validFrom, validUntil, ...rest } = dto;
    return this.prisma.bundle.create({
      data: {
        ...rest,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
        items: { create: items },
      },
      include: BUNDLE_INCLUDE,
    });
  }

  async update(id: string, dto: UpdateBundleDto) {
    await this.requireBundle(id);
    const { items, validFrom, validUntil, ...rest } = dto;
    return this.prisma.bundle.update({
      where: { id },
      data: {
        ...rest,
        ...(validFrom ? { validFrom: new Date(validFrom) } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
        ...(items ? { items: { deleteMany: {}, create: items } } : {}),
      },
      include: BUNDLE_INCLUDE,
    });
  }

  async remove(id: string): Promise<void> {
    await this.requireBundle(id);
    await this.prisma.bundle.delete({ where: { id } });
  }
}
