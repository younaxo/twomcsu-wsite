import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StreamingService {
  constructor(private readonly prisma: PrismaService) {}

  async publicList() {
    return this.prisma.streamChannel.findMany({
      where: { isActive: true },
      orderBy: [
        { isLive: 'desc' },
        { isPartner: 'desc' },
        { displayName: 'asc' },
      ],
    });
  }
}
