import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateServerCategoryDto } from './dto/create-server-category.dto';
import { UpdateServerCategoryDto } from './dto/update-server-category.dto';

@Injectable()
export class ServerCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async listActive() {
    return this.prisma.serverCategory.findMany({
      where: { isActive: true },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async listAllAdmin() {
    return this.prisma.serverCategory.findMany({
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
    });
  }

  async create(dto: CreateServerCategoryDto) {
    const existing = await this.prisma.serverCategory.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Категория с таким slug уже существует');
    }
    return this.prisma.serverCategory.create({ data: dto });
  }

  private async requireCategory(id: string) {
    const category = await this.prisma.serverCategory.findUnique({
      where: { id },
    });
    if (!category) {
      throw new NotFoundException('Категория не найдена');
    }
    return category;
  }

  async update(id: string, dto: UpdateServerCategoryDto) {
    await this.requireCategory(id);
    return this.prisma.serverCategory.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.requireCategory(id);
    const serversCount = await this.prisma.server.count({
      where: { categoryId: id },
    });
    if (serversCount > 0) {
      throw new BadRequestException(
        'Нельзя удалить категорию, в которой есть серверы',
      );
    }
    await this.prisma.serverCategory.delete({ where: { id } });
  }
}
