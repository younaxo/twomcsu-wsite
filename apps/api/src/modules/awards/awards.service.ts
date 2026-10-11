import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAwardDto } from './dto/create-award.dto';
import { UpdateAwardDto } from './dto/update-award.dto';

@Injectable()
export class AwardsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublic() {
    return this.prisma.award.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  /// Для админки — со счётчиком обладателей (ADR-0139): удаление награды
  /// снимает её у всех, это видно в подтверждении.
  async listAdmin() {
    const awards = await this.prisma.award.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { userAwards: true } } },
    });
    return awards.map(({ _count, ...award }) => ({
      ...award,
      holdersCount: _count.userAwards,
    }));
  }

  async create(dto: CreateAwardDto) {
    const existing = await this.prisma.award.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Награда с таким slug уже существует');
    }
    return this.prisma.award.create({ data: dto });
  }

  private async requireAward(id: string) {
    const award = await this.prisma.award.findUnique({ where: { id } });
    if (!award) {
      throw new NotFoundException('Награда не найдена');
    }
    return award;
  }

  async update(id: string, dto: UpdateAwardDto) {
    await this.requireAward(id);
    return this.prisma.award.update({ where: { id }, data: dto });
  }

  async remove(id: string): Promise<void> {
    await this.requireAward(id);
    await this.prisma.award.delete({ where: { id } });
  }

  async assign(
    userId: string,
    awardId: string,
    grantedBy: string,
  ): Promise<void> {
    await this.requireAward(awardId);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    const existing = await this.prisma.userAward.findUnique({
      where: { userId_awardId: { userId, awardId } },
    });
    if (existing) {
      throw new ConflictException('Награда уже выдана этому пользователю');
    }
    try {
      await this.prisma.userAward.create({
        data: { userId, awardId, grantedBy },
      });
    } catch (error) {
      // Параллельная выдача той же награды: проверка выше прошла у обоих
      // запросов, уникальный индекс пропустил только один (ADR-0139).
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Награда уже выдана этому пользователю');
      }
      throw error;
    }
  }

  async listForUser(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }
    return this.prisma.userAward.findMany({
      where: { userId },
      orderBy: [{ order: 'asc' }, { grantedAt: 'asc' }],
      select: {
        awardId: true,
        grantedAt: true,
        award: {
          select: { id: true, name: true, iconUrl: true, rarity: true },
        },
      },
    });
  }

  async revoke(userId: string, awardId: string): Promise<void> {
    const existing = await this.prisma.userAward.findUnique({
      where: { userId_awardId: { userId, awardId } },
    });
    if (!existing) {
      throw new NotFoundException('Награда не найдена у этого пользователя');
    }
    await this.prisma.userAward.delete({ where: { id: existing.id } });
  }
}
