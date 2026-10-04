import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBulkDiscountDto } from './dto/create-bulk-discount.dto';
import { CreateLoyaltyDiscountDto } from './dto/create-loyalty-discount.dto';
import { UpdateBulkDiscountDto } from './dto/update-bulk-discount.dto';
import { UpdateLoyaltyDiscountDto } from './dto/update-loyalty-discount.dto';

@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  async listBulk() {
    return this.prisma.bulkDiscount.findMany({ where: { isActive: true } });
  }

  async listLoyalty() {
    return this.prisma.loyaltyDiscount.findMany({
      where: { isActive: true },
      orderBy: { minPurchases: 'asc' },
    });
  }

  async createBulk(dto: CreateBulkDiscountDto) {
    return this.prisma.bulkDiscount.create({ data: dto });
  }

  private async requireBulk(id: string) {
    const discount = await this.prisma.bulkDiscount.findUnique({
      where: { id },
    });
    if (!discount) {
      throw new NotFoundException('Скидка не найдена');
    }
    return discount;
  }

  async updateBulk(id: string, dto: UpdateBulkDiscountDto) {
    await this.requireBulk(id);
    return this.prisma.bulkDiscount.update({ where: { id }, data: dto });
  }

  async removeBulk(id: string): Promise<void> {
    await this.requireBulk(id);
    await this.prisma.bulkDiscount.delete({ where: { id } });
  }

  async createLoyalty(dto: CreateLoyaltyDiscountDto) {
    return this.prisma.loyaltyDiscount.create({ data: dto });
  }

  private async requireLoyalty(id: string) {
    const discount = await this.prisma.loyaltyDiscount.findUnique({
      where: { id },
    });
    if (!discount) {
      throw new NotFoundException('Скидка за лояльность не найдена');
    }
    return discount;
  }

  async updateLoyalty(id: string, dto: UpdateLoyaltyDiscountDto) {
    await this.requireLoyalty(id);
    return this.prisma.loyaltyDiscount.update({ where: { id }, data: dto });
  }

  async removeLoyalty(id: string): Promise<void> {
    await this.requireLoyalty(id);
    await this.prisma.loyaltyDiscount.delete({ where: { id } });
  }
}
