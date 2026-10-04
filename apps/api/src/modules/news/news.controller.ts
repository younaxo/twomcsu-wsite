import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CreateNewsCommentDto } from './dto/create-news-comment.dto';
import { LatestNewsQueryDto } from './dto/latest-news-query.dto';
import { ListNewsQueryDto } from './dto/list-news-query.dto';
import { ReactNewsCommentDto } from './dto/react-news-comment.dto';
import { TagsQueryDto } from './dto/tags-query.dto';
import { UpdateNewsCommentDto } from './dto/update-news-comment.dto';
import { NewsService } from './news.service';

function viewerOf(req: Request): AuthenticatedUser | null {
  return (req as Request & { user?: AuthenticatedUser | null }).user ?? null;
}

@Controller()
export class NewsController {
  constructor(private readonly news: NewsService) {}

  @Get('news')
  async list(@Query() query: ListNewsQueryDto) {
    return this.news.listPublic(query);
  }

  @Get('news/featured')
  async featured() {
    return this.news.featured();
  }

  @Get('news/latest')
  async latest(@Query() query: LatestNewsQueryDto) {
    return this.news.latest(query.limit ?? 10);
  }

  @Get('news/popular')
  async popular() {
    return this.news.popular();
  }

  @Get('news/categories')
  async categories() {
    return this.news.categories();
  }

  @Get('news/tags')
  async tags(@Query() query: TagsQueryDto) {
    return this.news.tags(query);
  }

  @Get('rss/news')
  @Header('Content-Type', 'application/rss+xml; charset=utf-8')
  async rss() {
    return this.news.buildRssFeed();
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('news/:slug')
  async getBySlug(@Param('slug') slug: string, @Req() req: Request) {
    return this.news.getBySlug(slug, viewerOf(req)?.id ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Post('news/:id/like')
  async like(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.news.like(user.id, id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('news/:slug/comments')
  async listComments(
    @Param('slug') slug: string,
    @Query() query: ListNewsQueryDto,
  ) {
    return this.news.listComments(slug, query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post('news/:slug/comments')
  async createComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: CreateNewsCommentDto,
  ) {
    return this.news.createComment(user.id, slug, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('news/:slug/comments/:commentId')
  async updateComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() dto: UpdateNewsCommentDto,
  ) {
    return this.news.updateComment(user.id, commentId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('news/:slug/comments/:commentId')
  async deleteComment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
  ) {
    await this.news.removeComment(user.id, commentId);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('news/:slug/comments/:commentId/reactions')
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('commentId') commentId: string,
    @Body() dto: ReactNewsCommentDto,
  ) {
    return this.news.react(user.id, commentId, dto);
  }
}
