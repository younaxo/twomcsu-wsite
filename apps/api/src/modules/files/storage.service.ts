import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import { dirname, resolve, sep } from 'path';

/// Хранилище файлов за CDN (ADR-0008): драйвер `local` (диск API,
/// отдаётся по /uploads — dev/тесты) или `s3` (S3-совместимый бакет за
/// cdn-files.twomc.su). Ключ формирует backend; публичный URL строится
/// только здесь: CDN_BASE_URL + '/' + key.
export interface StorageDriver {
  put(key: string, body: Buffer, mime: string): Promise<void>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

export class LocalStorageDriver implements StorageDriver {
  constructor(readonly rootDir: string) {}

  /// Абсолютный путь строго внутри rootDir — traversal через ключ невозможен
  /// (ключ и так формирует сервер, это вторая линия защиты).
  private pathFor(key: string): string {
    const absolute = resolve(this.rootDir, key);
    if (!absolute.startsWith(this.rootDir + sep)) {
      throw new Error(`Недопустимый ключ хранилища: ${key}`);
    }
    return absolute;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.pathFor(key);
    await fs.mkdir(dirname(target), { recursive: true });
    await fs.writeFile(target, body);
  }

  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.pathFor(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.access(this.pathFor(key));
      return true;
    } catch {
      return false;
    }
  }
}

export class S3StorageDriver implements StorageDriver {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: mime,
        CacheControl: IMMUTABLE_CACHE,
      }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }
}

@Injectable()
export class StorageService implements StorageDriver {
  private readonly logger = new Logger(StorageService.name);
  private readonly driver: StorageDriver;
  readonly driverName: 'local' | 's3';
  readonly cdnBaseUrl: string;
  /// Корень локального хранилища (для static-раздачи в dev).
  readonly localRootDir: string;

  constructor(private readonly config: ConfigService) {
    this.cdnBaseUrl = (
      this.config.get<string>('CDN_BASE_URL') ?? 'http://localhost:4000/uploads'
    ).replace(/\/+$/, '');
    this.localRootDir = resolve(
      process.cwd(),
      this.config.get<string>('UPLOADS_DIR') ?? './uploads',
    );
    const driver = this.config.get<string>('STORAGE_DRIVER') ?? 'local';
    if (driver === 's3') {
      const endpoint = this.config.get<string>('STORAGE_ENDPOINT');
      this.driver = new S3StorageDriver(
        new S3Client({
          region: this.config.get<string>('STORAGE_REGION') ?? 'ru-1',
          endpoint: endpoint || undefined,
          forcePathStyle: Boolean(endpoint),
          credentials: {
            accessKeyId: this.config.get<string>('STORAGE_ACCESS_KEY') ?? '',
            secretAccessKey:
              this.config.get<string>('STORAGE_SECRET_KEY') ?? '',
          },
        }),
        this.config.get<string>('STORAGE_BUCKET') ?? '',
      );
      this.driverName = 's3';
    } else {
      this.driver = new LocalStorageDriver(this.localRootDir);
      this.driverName = 'local';
    }
    this.logger.log(
      `Хранилище файлов: ${this.driverName}, CDN ${this.cdnBaseUrl}`,
    );
  }

  /// Публичный URL по ключу — единственное место, где они склеиваются.
  toUrl(key: string): string {
    return `${this.cdnBaseUrl}/${key.replace(/^\/+/, '')}`;
  }

  put(key: string, body: Buffer, mime: string): Promise<void> {
    return this.driver.put(key, body, mime);
  }

  delete(key: string): Promise<void> {
    return this.driver.delete(key);
  }

  exists(key: string): Promise<boolean> {
    return this.driver.exists(key);
  }
}
