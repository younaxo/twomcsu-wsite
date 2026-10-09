import { Global, Module } from '@nestjs/common';
import { RolesModule } from '../roles/roles.module';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { StorageService } from './storage.service';

/// Файловое хранилище и загрузки (PHASE 23, ADR-0008). Глобальный: другие
/// домены привязывают TEMP-файлы к своим сущностям через FilesService.attach
/// и строят URL через FilesService.toUrl.
@Global()
@Module({
  imports: [RolesModule],
  controllers: [FilesController],
  providers: [StorageService, FilesService],
  exports: [StorageService, FilesService],
})
export class FilesModule {}
