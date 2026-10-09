import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { fromBuffer } from 'file-type';
import { sharp } from './sharp';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../roles/permission.service';
import { StorageService } from './storage.service';
import {
  EXTENSION_BY_MIME,
  UPLOAD_PRESETS,
  type UploadPreset,
  type UploadType,
} from './upload-types';

/// Сколько живёт TEMP-файл до orphan cleanup.
const TEMP_TTL_MS = 24 * 3_600_000;
const CLEANUP_HOUR = 3;
/// Защита от decompression-bomb: sharp не декодирует больше этого числа пикселей.
const MAX_INPUT_PIXELS = 40_000_000;

export interface StoredFile {
  id: string;
  key: string;
  url: string;
  mime: string;
  size: number;
  status: FileStatus;
}

export interface UploadContext {
  /// null — анонимная загрузка (только для пресетов с allowAnonymous).
  uploaderId: string | null;
  /// Владелец для префиксов с {ownerId} (id диалога, номер обращения, slug формы).
  ownerId?: string;
  ownerType?: string;
  /// Сразу привязать к владельцу (ATTACHED), иначе TEMP до явного attach().
  attach?: boolean;
}

/// Пайплайн загрузки (ADR-0008): лимит размера по типу → magic bytes
/// (file-type) и сверка с allowlist → для изображений sharp: rotate по
/// EXIF, strip metadata, resize по пресету, AVIF (анимированные GIF/WebP —
/// как есть) → put в storage → запись File. Клиентский mimetype и имя
/// файла не используются ни для чего.
@Injectable()
export class FilesService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FilesService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly permissions: PermissionService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    if (this.config.get<string>('NODE_ENV') === 'test') {
      return;
    }
    this.scheduleCleanup();
  }

  onModuleDestroy(): void {
    if (this.cleanupTimer) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  preset(type: UploadType): UploadPreset {
    return UPLOAD_PRESETS[type];
  }

  /// Проверка прав на тип загрузки — до чтения тела.
  async assertCanUpload(
    type: UploadType,
    uploaderId: string | null,
  ): Promise<void> {
    const preset = this.preset(type);
    if (!uploaderId) {
      if (!preset.allowAnonymous) {
        throw new ForbiddenException('Требуется вход');
      }
      return;
    }
    if (preset.permission) {
      const allowed = await this.permissions.hasAllPermissions(uploaderId, [
        preset.permission,
      ]);
      if (!allowed) {
        throw new ForbiddenException(
          'Недостаточно прав для этого типа загрузки',
        );
      }
    }
  }

  async upload(
    type: UploadType,
    buffer: Buffer,
    context: UploadContext,
  ): Promise<StoredFile> {
    const preset = this.preset(type);
    if (!buffer || buffer.length === 0) {
      throw new BadRequestException('Пустой файл');
    }
    if (buffer.length > preset.maxBytes) {
      throw new PayloadTooLargeException(
        `Файл больше лимита ${Math.round(preset.maxBytes / 1024 / 1024)} МБ`,
      );
    }
    const sniffed = await fromBuffer(buffer);
    const mime =
      sniffed?.mime ?? (this.looksLikeText(buffer) ? 'text/plain' : undefined);
    if (!mime || !preset.mimes.includes(mime)) {
      throw new UnsupportedMediaTypeException(
        `Тип файла не поддерживается${mime ? ` (${mime})` : ''}`,
      );
    }

    let body = buffer;
    let outMime = mime;
    if (preset.image && mime.startsWith('image/')) {
      const processed = await this.processImage(buffer, mime, preset);
      body = processed.body;
      outMime = processed.mime;
    }
    const extension = EXTENSION_BY_MIME[outMime] ?? 'bin';
    const key = this.buildKey(preset, context, extension);

    await this.storage.put(key, body, outMime);
    const record = await this.prisma.file.create({
      data: {
        key,
        mime: outMime,
        size: body.length,
        // Анонимные загрузки (формы для гостей) — от системного владельца
        // хранилища: FK обязателен; реальный uploader — null в ownerType.
        uploaderId: context.uploaderId ?? (await this.systemUploaderId()),
        ownerType: context.ownerType,
        ownerId: context.ownerId,
        status: context.attach ? FileStatus.ATTACHED : FileStatus.TEMP,
        attachedAt: context.attach ? new Date() : null,
      },
    });
    return this.toStored(record);
  }

  /// Привязать TEMP-файл к владельцу (после сохранения сущности, которая на
  /// него ссылается). Файл чужого uploader'а привязать нельзя.
  async attach(
    key: string,
    uploaderId: string,
    ownerType: string,
    ownerId: string,
  ): Promise<StoredFile> {
    const file = await this.prisma.file.findUnique({ where: { key } });
    if (!file || file.status === FileStatus.DELETED) {
      throw new BadRequestException('Файл не найден');
    }
    if (file.uploaderId !== uploaderId) {
      throw new ForbiddenException('Файл загружен другим пользователем');
    }
    const updated = await this.prisma.file.update({
      where: { key },
      data: {
        ownerType,
        ownerId,
        status: FileStatus.ATTACHED,
        attachedAt: new Date(),
      },
    });
    return this.toStored(updated);
  }

  /// Пометить удалённым и убрать из storage (идемпотентно).
  async remove(key: string): Promise<void> {
    const file = await this.prisma.file.findUnique({ where: { key } });
    if (!file) {
      return;
    }
    await this.storage.delete(key);
    await this.prisma.file.update({
      where: { key },
      data: { status: FileStatus.DELETED },
    });
  }

  /// Orphan cleanup: TEMP старше 24 ч и DELETED — из storage и из таблицы.
  async cleanupOrphans(now: Date = new Date()): Promise<{ deleted: number }> {
    const cutoff = new Date(now.getTime() - TEMP_TTL_MS);
    const orphans = await this.prisma.file.findMany({
      where: {
        OR: [
          { status: FileStatus.TEMP, createdAt: { lt: cutoff } },
          { status: FileStatus.DELETED },
        ],
      },
      select: { id: true, key: true },
      take: 500,
    });
    let deleted = 0;
    for (const orphan of orphans) {
      try {
        await this.storage.delete(orphan.key);
        await this.prisma.file.delete({ where: { id: orphan.id } });
        deleted += 1;
      } catch (error) {
        this.logger.warn(
          `Не удалось удалить файл ${orphan.key}: ${(error as Error).message}`,
        );
      }
    }
    return { deleted };
  }

  toUrl(key: string): string {
    return this.storage.toUrl(key);
  }

  private toStored(record: {
    id: string;
    key: string;
    mime: string;
    size: number;
    status: FileStatus;
  }): StoredFile {
    return {
      id: record.id,
      key: record.key,
      url: this.storage.toUrl(record.key),
      mime: record.mime,
      size: record.size,
      status: record.status,
    };
  }

  private buildKey(
    preset: UploadPreset,
    context: UploadContext,
    extension: string,
  ): string {
    const safe = (value: string | undefined) =>
      (value ?? 'shared').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) ||
      'shared';
    const prefix = preset.keyPrefix
      .replace('{userId}', safe(context.uploaderId ?? undefined))
      .replace('{ownerId}', safe(context.ownerId));
    return `${prefix}/${randomUUID()}.${extension}`;
  }

  private async processImage(
    buffer: Buffer,
    mime: string,
    preset: UploadPreset,
  ): Promise<{ body: Buffer; mime: string }> {
    const image = preset.image!;
    const metadata = await sharp(buffer, {
      limitInputPixels: MAX_INPUT_PIXELS,
    }).metadata();
    const animated = (metadata.pages ?? 1) > 1;
    if (animated && (mime === 'image/gif' || mime === 'image/webp')) {
      // Анимацию не конвертируем — только ограничиваем размер по пикселям.
      return { body: buffer, mime };
    }
    const body = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({
        width: image.width,
        height: image.height,
        fit: image.fit,
        withoutEnlargement: true,
      })
      .avif({ quality: image.quality, effort: 4 })
      .toBuffer();
    return { body, mime: 'image/avif' };
  }

  private looksLikeText(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, 512);
    for (const byte of sample) {
      if (
        byte === 0 ||
        (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13)
      ) {
        return false;
      }
    }
    return true;
  }

  private systemUploaderCache: string | null = null;

  private async systemUploaderId(): Promise<string> {
    if (this.systemUploaderCache) {
      return this.systemUploaderCache;
    }
    const system = await this.prisma.user.findFirst({
      where: { accountType: 'SYSTEM' },
      select: { id: true },
    });
    if (!system) {
      throw new ForbiddenException(
        'Анонимная загрузка недоступна: нет системного аккаунта',
      );
    }
    this.systemUploaderCache = system.id;
    return system.id;
  }

  private scheduleCleanup(): void {
    const now = new Date();
    const next = new Date(now);
    next.setHours(CLEANUP_HOUR, 0, 0, 0);
    if (next <= now) {
      next.setDate(next.getDate() + 1);
    }
    this.cleanupTimer = setTimeout(() => {
      this.cleanupOrphans()
        .then(({ deleted }) =>
          this.logger.log(`Orphan cleanup: удалено ${deleted}`),
        )
        .catch((error: Error) =>
          this.logger.warn(`Orphan cleanup не удался: ${error.message}`),
        )
        .finally(() => this.scheduleCleanup());
    }, next.getTime() - now.getTime());
    this.cleanupTimer.unref();
  }
}
