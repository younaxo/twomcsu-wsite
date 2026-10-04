import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVoteSiteDto } from './dto/create-vote-site.dto';
import { UpdateVoteSiteDto } from './dto/update-vote-site.dto';

@Injectable()
export class VotingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get bcryptRounds(): number {
    return this.config.get<number>('BCRYPT_ROUNDS', 12);
  }

  private generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  async list() {
    return this.prisma.voteSite.findMany({
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        url: true,
        logoUrl: true,
        rewardCoins: true,
        cooldownHours: true,
        sortOrder: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /// Сырой секрет возвращается только один раз, при создании/rotate —
  /// сохраняется исключительно bcrypt-хеш (webhookSecretHash), как и пароли.
  async create(
    dto: CreateVoteSiteDto,
  ): Promise<{ site: unknown; secret: string }> {
    const existing = await this.prisma.voteSite.findUnique({
      where: { slug: dto.slug },
    });
    if (existing) {
      throw new ConflictException('Vote-сайт с таким slug уже существует');
    }
    const secret = this.generateSecret();
    const webhookSecretHash = await bcrypt.hash(secret, this.bcryptRounds);
    const site = await this.prisma.voteSite.create({
      data: { ...dto, webhookSecretHash },
    });
    const { webhookSecretHash: _hash, ...rest } = site;
    return { site: rest, secret };
  }

  async update(id: string, dto: UpdateVoteSiteDto) {
    const site = await this.prisma.voteSite.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException('Vote-сайт не найден');
    }
    const updated = await this.prisma.voteSite.update({
      where: { id },
      data: dto,
    });
    const { webhookSecretHash: _hash, ...rest } = updated;
    return rest;
  }

  async remove(id: string): Promise<void> {
    const site = await this.prisma.voteSite.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException('Vote-сайт не найден');
    }
    await this.prisma.voteSite.delete({ where: { id } });
  }

  async rotateSecret(id: string): Promise<{ secret: string }> {
    const site = await this.prisma.voteSite.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException('Vote-сайт не найден');
    }
    const secret = this.generateSecret();
    const webhookSecretHash = await bcrypt.hash(secret, this.bcryptRounds);
    await this.prisma.voteSite.update({
      where: { id },
      data: { webhookSecretHash },
    });
    return { secret };
  }
}
