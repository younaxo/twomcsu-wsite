import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { escapeToHtml } from '../../common/html.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTopicDto } from './dto/create-topic.dto';
import { ReorderTopicsDto } from './dto/reorder-topics.dto';
import { UpdateTopicDto } from './dto/update-topic.dto';

@Injectable()
export class TopicsAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin() {
    // Текст темы (до 100 000 символов) в списке не нужен — только в карточке
    // редактирования (ADR-0145).
    return this.prisma.topic.findMany({
      orderBy: [{ isPinned: 'desc' }, { order: 'asc' }],
      omit: { content: true, contentHtml: true },
    });
  }

  async getAdminById(id: string) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) {
      throw new NotFoundException('Тема не найдена');
    }
    return topic;
  }

  async create(createdBy: string, dto: CreateTopicDto) {
    const existing = await this.prisma.topic.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Тема с таким slug уже существует');
    }
    return this.prisma.topic
      .create({
        data: { ...dto, createdBy, contentHtml: escapeToHtml(dto.content) },
      })
      .catch((error: unknown) => {
        // Гонка двух создателей с одним slug (ADR-0145).
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictException('Тема с таким slug уже существует');
        }
        throw error;
      });
  }

  async update(id: string, updatedBy: string, dto: UpdateTopicDto) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) {
      throw new NotFoundException('Тема не найдена');
    }
    const { content, ...rest } = dto;
    return this.prisma.topic.update({
      where: { id },
      data: {
        ...rest,
        ...(content ? { content, contentHtml: escapeToHtml(content) } : {}),
        updatedBy,
      },
    });
  }

  async remove(id: string): Promise<void> {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) {
      throw new NotFoundException('Тема не найдена');
    }
    await this.prisma.topic.delete({ where: { id } });
  }

  async reorder(dto: ReorderTopicsDto): Promise<void> {
    await this.prisma.$transaction(
      dto.items.map((item) =>
        this.prisma.topic.update({
          where: { id: item.id },
          data: { order: item.order },
        }),
      ),
    );
  }

  async setPinned(id: string, pinned: boolean) {
    const topic = await this.prisma.topic.findUnique({ where: { id } });
    if (!topic) {
      throw new NotFoundException('Тема не найдена');
    }
    return this.prisma.topic.update({
      where: { id },
      data: { isPinned: pinned },
    });
  }
}
