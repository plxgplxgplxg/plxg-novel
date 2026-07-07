import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateBookDto {
  @IsString()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  originalTitle?: string;
}
