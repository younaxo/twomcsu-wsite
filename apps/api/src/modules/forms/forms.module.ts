import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { FriendsModule } from '../friends/friends.module';
import { FormResponsesService } from './form-responses.service';
import { FormsAdminController } from './forms-admin.controller';
import { FormsAdminService } from './forms-admin.service';
import { FormsController } from './forms.controller';
import { FormsService } from './forms.service';

@Module({
  imports: [AuthModule, FriendsModule],
  controllers: [FormsController, FormsAdminController],
  providers: [FormsService, FormsAdminService, FormResponsesService],
})
export class FormsModule {}
