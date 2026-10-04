import { Injectable, NotFoundException } from '@nestjs/common';
import { CommentReportStatus, ProfileReportStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ReviewContentReportDto } from './dto/review-content-report.dto';

@Injectable()
export class ContentReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async listCommentReports(status?: CommentReportStatus) {
    return this.prisma.commentReport.findMany({
      where: status ? { status } : undefined,
      include: { comment: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewCommentReport(
    id: string,
    reviewerId: string,
    dto: ReviewContentReportDto,
  ) {
    const report = await this.prisma.commentReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Жалоба не найдена');
    }
    return this.prisma.commentReport.update({
      where: { id },
      data: {
        status: dto.status as CommentReportStatus,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
    });
  }

  async listProfileReports(status?: ProfileReportStatus) {
    return this.prisma.profileReport.findMany({
      where: status ? { status } : undefined,
      include: { profile: true, reporter: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewProfileReport(
    id: string,
    reviewerId: string,
    dto: ReviewContentReportDto,
  ) {
    const report = await this.prisma.profileReport.findUnique({
      where: { id },
    });
    if (!report) {
      throw new NotFoundException('Жалоба не найдена');
    }
    return this.prisma.profileReport.update({
      where: { id },
      data: {
        status: dto.status as ProfileReportStatus,
        reviewedBy: reviewerId,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
    });
  }
}
