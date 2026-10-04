import { Module } from '@nestjs/common';
import { DepartmentsController } from './departments.controller';
import { UserDepartmentsController } from './user-departments.controller';

@Module({
  controllers: [DepartmentsController, UserDepartmentsController],
})
export class DepartmentsModule {}
