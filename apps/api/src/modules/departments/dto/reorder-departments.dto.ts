import { ArrayUnique, IsArray, IsString } from 'class-validator';

/// Порядок отделов в списке пользователя — массив departmentId в желаемом
/// порядке отображения.
export class ReorderDepartmentsDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  departmentIds!: string[];
}
