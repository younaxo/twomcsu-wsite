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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { AchievementsService } from './achievements.service';
import { CreateAchievementDto } from './dto/create-achievement.dto';
import { UpdateAchievementDto } from './dto/update-achievement.dto';

@Controller('admin/achievements')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminAchievementsController {
  constructor(private readonly achievements: AchievementsService) {}

  @Get()
  @RequirePermissions('achievements.view')
  async list() {
    return this.achievements.listAdmin();
  }

  @Post()
  @RequirePermissions('achievements.create')
  async create(@Body() dto: CreateAchievementDto) {
    return this.achievements.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('achievements.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateAchievementDto) {
    return this.achievements.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('achievements.delete')
  async remove(@Param('id') id: string) {
    await this.achievements.remove(id);
    return { success: true };
  }

  @Post('check-all-users')
  @RequirePermissions('achievements.check_all_users.create')
  async checkAll() {
    return this.achievements.checkAllUsers();
  }
}
