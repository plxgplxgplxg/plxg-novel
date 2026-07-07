import { IsString, IsInt, IsOptional, Min, MaxLength } from 'class-validator';

export class CreateChapterDto {
  @IsInt()
  @Min(1)
  chapterNumber: number;

  @IsString()
  @MaxLength(255)
  titleOriginal: string;

  @IsString()
  rawContent: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  titleTranslated?: string;
}
