import {
  Body,
  ConflictException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { ReviewMediaRequestDto } from './dto/review-media-request.dto';

@Controller('admin/media-requests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class MediaRequestsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('media_requests.view')
  async list() {
    return this.prisma.mediaBadgeRequest.findMany({
      where: { status: 'PENDING' },
      include: {
        user: { select: { id: true, username: true, tag: true, avatar: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  @Patch(':id')
  @RequirePermissions('media_requests.edit')
  async review(
    @Param('id') id: string,
    @Body() dto: ReviewMediaRequestDto,
    @CurrentUser() admin: AuthenticatedUser,
  ) {
    const request = await this.prisma.mediaBadgeRequest.findUnique({
      where: { id },
    });
    if (!request) {
      throw new NotFoundException('Заявка не найдена');
    }
    // Рассматривается только ожидающая заявка (ADR-0141): повторное решение
    // перезаписывало бы первое, а отказ после одобрения не снимал значок.
    // updateMany по статусу атомарен — из двух одновременных решений
    // проходит одно; значок выдаётся в той же транзакции.
    return this.prisma.$transaction(async (tx) => {
      const { count } = await tx.mediaBadgeRequest.updateMany({
        where: { id, status: 'PENDING' },
        data: {
          status: dto.status,
          reviewedBy: admin.id,
          reviewedAt: new Date(),
          reviewNote: dto.reviewNote,
        },
      });
      if (count === 0) {
        throw new ConflictException('Заявка уже рассмотрена');
      }
      if (dto.status === 'APPROVED') {
        await tx.userMediaBadge.upsert({
          where: {
            userId_mediaGroup: {
              userId: request.userId,
              mediaGroup: request.mediaGroup,
            },
          },
          create: {
            userId: request.userId,
            mediaGroup: request.mediaGroup,
            channelUrl: request.channelUrl,
            isApproved: true,
            approvedBy: admin.id,
            approvedAt: new Date(),
          },
          update: {
            isApproved: true,
            approvedBy: admin.id,
            approvedAt: new Date(),
            channelUrl: request.channelUrl,
          },
        });
      }
      return tx.mediaBadgeRequest.findUniqueOrThrow({ where: { id } });
    });
  }
}
