import {
  Body,
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
      include: { user: { select: { id: true, username: true } } },
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
    const updated = await this.prisma.mediaBadgeRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedBy: admin.id,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
    });
    if (dto.status === 'APPROVED') {
      await this.prisma.userMediaBadge.upsert({
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
    return updated;
  }
}
