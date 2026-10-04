import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { FieldAnswerDto } from './field-answer.dto';

export class SubmitResponseDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => FieldAnswerDto)
  answers!: FieldAnswerDto[];

  @IsOptional()
  @IsString()
  captchaToken?: string;

  @IsOptional()
  @IsString()
  inviteCode?: string;
}
