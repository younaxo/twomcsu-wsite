import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { EventAttendanceDto } from './dto/event-attendance.dto';
import { ListEventsQueryDto } from './dto/list-events-query.dto';
import { EventsService } from './events.service';

function viewerOf(req: Request): AuthenticatedUser | null {
  return (req as Request & { user?: AuthenticatedUser | null }).user ?? null;
}

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async list(@Query() query: ListEventsQueryDto, @Req() req: Request) {
    return this.events.list(query, viewerOf(req)?.id ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('featured')
  async featured(@Req() req: Request) {
    return this.events.featured(viewerOf(req)?.id ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  async mine(@CurrentUser() user: AuthenticatedUser) {
    return this.events.mine(user.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':slug')
  async bySlug(@Param('slug') slug: string, @Req() req: Request) {
    return this.events.bySlug(slug, viewerOf(req)?.id ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Post(':id/attendance')
  async attend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: EventAttendanceDto,
  ) {
    return this.events.attend(user.id, id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id/attendance')
  async leave(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    await this.events.leave(user.id, id);
    return { success: true };
  }
}
