import { IsString } from 'class-validator';

export class AssignCustomPositionDto {
  @IsString()
  customPositionId!: string;
}
