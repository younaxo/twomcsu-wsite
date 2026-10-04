import { Controller, Get } from '@nestjs/common';
import { StreamingService } from './streaming.service';

@Controller('streams')
export class StreamingController {
  constructor(private readonly streaming: StreamingService) {}

  @Get()
  async list() {
    return this.streaming.publicList();
  }
}
