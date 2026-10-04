import { Module } from '@nestjs/common';
import { StreamingAdminController } from './streaming-admin.controller';
import { StreamingAdminService } from './streaming-admin.service';
import { StreamingController } from './streaming.controller';
import { StreamingService } from './streaming.service';

@Module({
  controllers: [StreamingController, StreamingAdminController],
  providers: [StreamingService, StreamingAdminService],
})
export class StreamingModule {}
