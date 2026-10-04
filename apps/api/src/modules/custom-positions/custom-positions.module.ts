import { Module } from '@nestjs/common';
import { CustomPositionsController } from './custom-positions.controller';
import { UserCustomPositionController } from './user-custom-position.controller';

@Module({
  controllers: [CustomPositionsController, UserCustomPositionController],
})
export class CustomPositionsModule {}
