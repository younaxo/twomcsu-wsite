import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { SaveDraftDto } from './dto/save-draft.dto';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { FormsService } from './forms.service';

function viewerOf(req: Request): AuthenticatedUser | null {
  return (req as Request & { user?: AuthenticatedUser | null }).user ?? null;
}

@Controller('forms')
export class FormsController {
  constructor(private readonly forms: FormsService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Get()
  async listPublished(@Req() req: Request) {
    return this.forms.listPublished(viewerOf(req)?.id ?? null);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my')
  async listMy(@CurrentUser() user: AuthenticatedUser) {
    return this.forms.getMy(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('my/responses')
  async listMyResponses(@CurrentUser() user: AuthenticatedUser) {
    return this.forms.listMyResponses(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('autofill')
  async autofill(@CurrentUser() user: AuthenticatedUser) {
    return this.forms.getAutofill(user.id);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get('invite/:code')
  async getByInvite(@Param('code') code: string) {
    return this.forms.getFormByInviteCode(code);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Get(':slug')
  async getBySlug(@Param('slug') slug: string, @Req() req: Request) {
    return this.forms.getBySlug(slug, viewerOf(req)?.id ?? null);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post(':slug/responses')
  async submit(
    @Param('slug') slug: string,
    @Body() dto: SubmitResponseDto,
    @Req() req: Request,
  ) {
    return this.forms.submitResponse(
      slug,
      viewerOf(req)?.id ?? null,
      dto,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post(':slug/responses/save-draft')
  async saveDraft(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.forms.saveDraft(slug, user.id, dto);
  }
}
