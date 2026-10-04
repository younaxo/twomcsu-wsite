import { EventAttendanceStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class EventAttendanceDto {
  @IsEnum(EventAttendanceStatus)
  status!: EventAttendanceStatus;
}
