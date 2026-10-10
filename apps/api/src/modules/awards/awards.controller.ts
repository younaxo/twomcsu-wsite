import {
  Body,
  Controller,
  Delete,
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
import { AwardsService } from './awards.service';
import { CreateAwardDto } from './dto/create-award.dto';
import { UpdateAwardDto } from './dto/update-award.dto';
import { SiteModule } from '../system/site-module.decorator';

@Controller()
export class AwardsController {
  constructor(private readonly awards: AwardsService) {}

  @SiteModule('achievements')
  @Get('awards')
  async listPublic() {
    return this.awards.listPublic();
  }

  @Get('admin/awards')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('awards.view')
  async listAdmin() {
    return this.awards.listAdmin();
  }

  @Post('admin/awards')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('awards.create')
  async create(@Body() dto: CreateAwardDto) {
    return this.awards.create(dto);
  }

  @Patch('admin/awards/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('awards.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateAwardDto) {
    return this.awards.update(id, dto);
  }

  @Delete('admin/awards/:id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('awards.delete')
  async remove(@Param('id') id: string) {
    await this.awards.remove(id);
    return { success: true };
  }

  @Post('admin/users/:userId/awards/:awardId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.awards')
  async assign(
    @Param('userId') userId: string,
    @Param('awardId') awardId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.awards.assign(userId, awardId, user.id);
    return { success: true };
  }

  @Delete('admin/users/:userId/awards/:awardId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('users.awards')
  async revoke(
    @Param('userId') userId: string,
    @Param('awardId') awardId: string,
  ) {
    await this.awards.revoke(userId, awardId);
    return { success: true };
  }
}
