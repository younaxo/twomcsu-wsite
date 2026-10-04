import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { ListTopicsQueryDto } from './dto/list-topics-query.dto';
import { TopicsService } from './topics.service';

function viewerOf(req: Request): AuthenticatedUser | null {
  return (req as Request & { user?: AuthenticatedUser | null }).user ?? null;
}

@Controller('topics')
export class TopicsController {
  constructor(private readonly topics: TopicsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@Query() query: ListTopicsQueryDto, @Req() req: Request) {
    return this.topics.listPublic(query, viewerOf(req)?.id ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string, @Req() req: Request) {
    return this.topics.getBySlug(slug, viewerOf(req)?.id ?? null);
  }
}
