import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { IssuePunishmentDto } from './dto/issue-punishment.dto';
import { UpdatePunishmentDto } from './dto/update-punishment.dto';
import { PunishmentsService } from './punishments.service';

@Controller()
export class PunishmentsController {
  constructor(private readonly punishments: PunishmentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get('users/me/punishments')
  async listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.punishments.listMyPunishments(user.id);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.punishments')
  @Get('admin/users/:username/punishments')
  async listByUsername(@Param('username') username: string) {
    return this.punishments.listByUsername(username);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.punishments')
  @Post('admin/users/:userId/punishments')
  async issue(
    @Param('userId') userId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: IssuePunishmentDto,
  ) {
    return this.punishments.issuePunishment(userId, user.id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.punishments')
  @Patch('admin/users/:userId/punishments/:id')
  async update(
    @Param('userId') userId: string,
    @Param('id') id: string,
    @Body() dto: UpdatePunishmentDto,
  ) {
    return this.punishments.updatePunishment(userId, id, dto);
  }
}
