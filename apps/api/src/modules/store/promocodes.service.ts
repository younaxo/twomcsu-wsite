import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';

@Injectable()
export class PromocodesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(search?: string) {
    const where: Prisma.PromoCodeWhereInput = search
      ? { code: { contains: search, mode: 'insensitive' } }
      : {};
    return this.prisma.promoCode.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: CreatePromoCodeDto) {
    const code = dto.code.toUpperCase();
    const existing = await this.prisma.promoCode.findUnique({
      where: { code },
    });
    if (existing) {
      throw new ConflictException('Такой промокод уже существует');
    }
    const { validFrom, validUntil, ...rest } = dto;
    return this.prisma.promoCode.create({
      data: {
        ...rest,
        code,
        validFrom: validFrom ? new Date(validFrom) : undefined,
        validUntil: validUntil ? new Date(validUntil) : undefined,
      },
    });
  }

  private async requirePromoCode(id: string) {
    const promo = await this.prisma.promoCode.findUnique({ where: { id } });
    if (!promo) {
      throw new NotFoundException('Промокод не найден');
    }
    return promo;
  }

  async update(id: string, dto: UpdatePromoCodeDto) {
    await this.requirePromoCode(id);
    const { validFrom, validUntil, ...rest } = dto;
    return this.prisma.promoCode.update({
      where: { id },
      data: {
        ...rest,
        ...(validFrom ? { validFrom: new Date(validFrom) } : {}),
        ...(validUntil ? { validUntil: new Date(validUntil) } : {}),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.requirePromoCode(id);
    await this.prisma.promoCode.delete({ where: { id } });
  }
}
