import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { ReactCommentDto } from './dto/react-comment.dto';
import { ReportCommentDto } from './dto/report-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';
import { SiteModule } from '../system/site-module.decorator';

class ListCommentsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

@SiteModule('comments')
@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  @Public()
  @Get('users/:username/comments')
  async list(
    @Param('username') username: string,
    @Query() query: ListCommentsQueryDto,
  ) {
    return this.comments.list(username, query.page ?? 1, query.limit ?? 20);
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/:username/comments')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('username') username: string,
    @Body() dto: CreateCommentDto,
  ) {
    return this.comments.create(user.id, username, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('comments/:id')
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
  ) {
    return this.comments.update(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('comments/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    await this.comments.remove(user.id, id);
    return { success: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('comments/:id/reactions')
  async react(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReactCommentDto,
  ) {
    return this.comments.react(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('comments/:id/report')
  async report(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ReportCommentDto,
  ) {
    return this.comments.report(user.id, id, dto);
  }
}
