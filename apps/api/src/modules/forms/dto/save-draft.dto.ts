import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { FieldAnswerDto } from './field-answer.dto';

export class SaveDraftDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FieldAnswerDto)
  answers!: FieldAnswerDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  currentStep?: number;
}
