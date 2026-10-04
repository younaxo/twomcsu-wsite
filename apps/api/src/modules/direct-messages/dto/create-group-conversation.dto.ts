import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsString,
  Length,
} from 'class-validator';

export class CreateGroupConversationDto {
  @IsString()
  @Length(1, 80)
  title!: string;

  @IsArray()
  @ArrayUnique()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  memberUsernames!: string[];
}
