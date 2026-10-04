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
import { CreateFormInviteDto } from './dto/create-form-invite.dto';
import { CreateFormDto } from './dto/create-form.dto';
import { ListAdminFormsQueryDto } from './dto/list-admin-forms-query.dto';
import { ListResponsesQueryDto } from './dto/list-responses-query.dto';
import { UpdateFormDto } from './dto/update-form.dto';
import { FormResponsesService } from './form-responses.service';
import { FormsAdminService } from './forms-admin.service';

@Controller('admin/forms')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FormsAdminController {
  constructor(
    private readonly admin: FormsAdminService,
    private readonly responses: FormResponsesService,
  ) {}

  @Get()
  @RequirePermissions('forms.view')
  async list(@Query() query: ListAdminFormsQueryDto) {
    return this.admin.listAdmin(query);
  }

  @Get(':id')
  @RequirePermissions('forms.view')
  async getById(@Param('id') id: string) {
    return this.admin.getFormById(id);
  }

  @Post()
  @RequirePermissions('forms.create')
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFormDto,
  ) {
    return this.admin.createForm(user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('forms.edit')
  async update(@Param('id') id: string, @Body() dto: UpdateFormDto) {
    return this.admin.updateForm(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('forms.delete')
  async remove(@Param('id') id: string) {
    await this.admin.archiveForm(id);
    return { success: true };
  }

  @Post(':id/publish')
  @RequirePermissions('forms.publish')
  async publish(@Param('id') id: string) {
    return this.admin.publishForm(id);
  }

  @Post(':id/close')
  @RequirePermissions('forms.close')
  async close(@Param('id') id: string) {
    return this.admin.closeForm(id);
  }

  @Post(':id/duplicate')
  @RequirePermissions('forms.duplicate')
  async duplicate(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.admin.duplicateForm(id, user.id);
  }

  @Get(':id/responses')
  @RequirePermissions('forms.responses')
  async getResponses(
    @Param('id') id: string,
    @Query() query: ListResponsesQueryDto,
  ) {
    return this.responses.getResponses(id, query);
  }

  @Get(':id/responses/:responseId')
  @RequirePermissions('forms.responses')
  async getResponse(
    @Param('id') id: string,
    @Param('responseId') responseId: string,
  ) {
    return this.responses.getResponse(id, responseId);
  }

  @Delete(':id/responses/:responseId')
  @RequirePermissions('forms.responses')
  async deleteResponse(
    @Param('id') id: string,
    @Param('responseId') responseId: string,
  ) {
    await this.responses.deleteResponse(id, responseId);
    return { success: true };
  }

  @Get(':id/stats')
  @RequirePermissions('forms.stats')
  async getStats(@Param('id') id: string) {
    return this.responses.getStats(id);
  }

  @Get(':id/invites')
  @RequirePermissions('forms.invites')
  async listInvites(@Param('id') id: string) {
    return this.responses.listInvites(id);
  }

  @Post(':id/invites')
  @RequirePermissions('forms.invites')
  async createInvite(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateFormInviteDto,
  ) {
    return this.responses.createInvite(id, user.id, dto);
  }

  @Delete(':id/invites/:code')
  @RequirePermissions('forms.invites')
  async deleteInvite(@Param('id') id: string, @Param('code') code: string) {
    await this.responses.deleteInvite(id, code);
    return { success: true };
  }
}
