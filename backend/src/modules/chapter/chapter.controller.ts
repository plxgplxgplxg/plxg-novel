import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import { ChapterService } from './chapter.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.interface';

@Controller()
@UseGuards(AuthGuard('jwt'))
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  @Post('books/:bookId/chapters')
  addChapter(
    @Param('bookId') bookId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateChapterDto,
  ) {
    return this.chapterService.addChapter(bookId, user.sub, dto);
  }

  @Post('books/:bookId/chapters/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadChapters(
    @Param('bookId') bookId: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    const content = file.buffer.toString('utf-8');
    return this.chapterService.uploadAndSplitChapters(bookId, user.sub, content);
  }

  @Get('chapters/:id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.chapterService.findOne(id, user.sub);
  }

  @Post('chapters/:id/translate')
  @HttpCode(HttpStatus.ACCEPTED)
  retranslate(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.chapterService.retranslateChapter(id, user.sub);
  }
}
