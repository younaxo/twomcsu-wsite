import {
  BadRequestException,
  Controller,
  Delete,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt-auth.guard';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from './files.service';
import { isUploadType, UPLOAD_TYPES } from './upload-types';
import { SiteModule } from '../system/site-module.decorator';

/// Единый лимит multipart на входе; точный лимит по типу — в FilesService.
const MULTIPART_LIMIT = 20 * 1024 * 1024;

const upload = () =>
  FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: MULTIPART_LIMIT, files: 1 },
  });

/// Загрузка файлов (PHASE 23, ADR-0008). Клиент присылает multipart-поле
/// `file` и `type` из UPLOAD_TYPES; ключ, формат и права — на стороне сервера.
@SiteModule('uploads')
@Controller()
export class FilesController {
  constructor(
    private readonly files: FilesService,
    private readonly prisma: PrismaService,
  ) {}

  /// Универсальная загрузка: TEMP-файл, который сущность привяжет при
  /// сохранении (`ownerId` — для префиксов с владельцем).
  @UseGuards(OptionalJwtAuthGuard)
  @Post('files/upload')
  @UseInterceptors(upload())
  async upload(
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('type') type: string | undefined,
    @Query('ownerId') ownerId: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!type || !isUploadType(type)) {
      throw new BadRequestException(`Укажите type: ${UPLOAD_TYPES.join(', ')}`);
    }
    if (type === 'avatar' || type === 'banner') {
      throw new BadRequestException(
        'Аватар и баннер загружаются через /users/me/avatar и /users/me/banner',
      );
    }
    if (!file) {
      throw new BadRequestException('Поле file обязательно');
    }
    await this.files.assertCanUpload(type, user?.id ?? null);
    return this.files.upload(type, file.buffer, {
      uploaderId: user?.id ?? null,
      ownerId,
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/me/avatar')
  @UseInterceptors(upload())
  async uploadAvatar(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.replaceProfileImage(user.id, 'avatar', file);
  }

  @UseGuards(JwtAuthGuard)
  @Post('users/me/banner')
  @UseInterceptors(upload())
  async uploadBanner(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.replaceProfileImage(user.id, 'banner', file);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('users/me/avatar')
  async deleteAvatar(@CurrentUser() user: AuthenticatedUser) {
    return this.clearProfileImage(user.id, 'avatar');
  }

  @UseGuards(JwtAuthGuard)
  @Delete('users/me/banner')
  async deleteBanner(@CurrentUser() user: AuthenticatedUser) {
    return this.clearProfileImage(user.id, 'banner');
  }

  /// Удалить свой TEMP-файл (например, отменённая загрузка в форме).
  @UseGuards(JwtAuthGuard)
  @Delete('files/:id')
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const file = await this.prisma.file.findUnique({ where: { id } });
    if (!file || file.uploaderId !== user.id || file.status !== 'TEMP') {
      throw new BadRequestException('Файл не найден или уже привязан');
    }
    await this.files.remove(file.key);
    return { success: true };
  }

  private async replaceProfileImage(
    userId: string,
    field: 'avatar' | 'banner',
    file: Express.Multer.File | undefined,
  ) {
    if (!file) {
      throw new BadRequestException('Поле file обязательно');
    }
    const stored = await this.files.upload(field, file.buffer, {
      uploaderId: userId,
      ownerType: 'User',
      ownerId: userId,
      attach: true,
    });
    const previous = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatar: true, banner: true },
    });
    await this.prisma.user.update({
      where: { id: userId },
      data: { [field]: stored.key },
    });
    const previousKey = previous[field];
    if (previousKey && previousKey !== stored.key) {
      await this.files.remove(previousKey);
    }
    return stored;
  }

  private async clearProfileImage(userId: string, field: 'avatar' | 'banner') {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { avatar: true, banner: true },
    });
    const key = current[field];
    await this.prisma.user.update({
      where: { id: userId },
      data: { [field]: null },
    });
    if (key) {
      await this.files.remove(key);
    }
    return { success: true };
  }
}
