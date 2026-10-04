import { Module } from '@nestjs/common';
import { VotingAdminController } from './voting-admin.controller';
import { VotingAdminService } from './voting-admin.service';
import { VotingController } from './voting.controller';
import { VotingService } from './voting.service';

@Module({
  controllers: [VotingController, VotingAdminController],
  providers: [VotingService, VotingAdminService],
})
export class VotingModule {}
