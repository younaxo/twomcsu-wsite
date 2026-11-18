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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { RequirePermissions } from '../roles/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../roles/guards/permissions.guard';
import { CreatePromoCodeDto } from './dto/create-promo-code.dto';
import { UpdatePromoCodeDto } from './dto/update-promo-code.dto';
import { PromocodesService } from './promocodes.service';

@Controller('admin/promocodes')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PromocodesAdminController {
  constructor(private readonly promocodes: PromocodesService) {}

  @Get()
  @RequirePermissions('promocodes.view')
  async list(@Query('search') search?: string) {
    return this.promocodes.list(search);
  }

  @Post()
  @RequirePermissions('promocodes.create')
  async create(
    @Body() dto: CreatePromoCodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promocodes.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('promocodes.edit')
  async update(
    @Param('id') id: string,
    @Body() dto: UpdatePromoCodeDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.promocodes.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('promocodes.delete')
  async remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    await this.promocodes.remove(id, user.id);
    return { success: true };
  }
}
