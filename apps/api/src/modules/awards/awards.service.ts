import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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

  async listAdmin() {
    return this.prisma.award.findMany({ orderBy: { name: 'asc' } });
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
    await this.prisma.userAward.create({
      data: { userId, awardId, grantedBy },
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
