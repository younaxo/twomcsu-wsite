import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /// Плоский список с parentId — дерево строится клиентом; так же делает
  /// TopicsService (PHASE 14) для похожей иерархии.
  async listTree() {
    return this.prisma.category.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async listAdmin() {
    return this.prisma.category.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateCategoryDto) {
    const existing = await this.prisma.category.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Категория с таким slug уже существует');
    }
    if (dto.parentId) {
      await this.requireCategory(dto.parentId);
    }
    return this.prisma.category.create({ data: dto });
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.category.findUnique({ where: { id } });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
    return category;
  }

  async update(id: string, dto: UpdateCategoryDto) {
    await this.requireCategory(id);
    if (dto.parentId) {
      if (dto.parentId === id) {
        throw new BadRequestException(
          'Категория не может быть родителем самой себя',
        );
      }
      await this.requireCategory(dto.parentId);
    }
    return this.prisma.category.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.requireCategory(id);
    // Проверки и удаление — в одной транзакции под блокировкой строки
    // категории: параллельное создание подкатегории/товара (FK берёт
    // FOR KEY SHARE) дождётся конца и не потеряет родителя (parentId
    // обнуляется через ON DELETE SET NULL). Конфликт состояния — 409.
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM categories WHERE id = ${id} FOR UPDATE`;
      const childrenCount = await tx.category.count({
        where: { parentId: id },
      });
      if (childrenCount > 0) {
        throw new ConflictException({
          code: 'CATEGORY_HAS_CHILDREN',
          message: 'Нельзя удалить категорию с подкатегориями',
        });
      }
      const productsCount = await tx.product.count({
        where: { categoryId: id },
      });
      if (productsCount > 0) {
        throw new ConflictException({
          code: 'CATEGORY_HAS_PRODUCTS',
          message: 'Нельзя удалить категорию с товарами',
        });
      }
      await tx.category.delete({ where: { id } });
    });
  }
}
