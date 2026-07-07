import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '@nestjs/passport';
import * as mammoth from 'mammoth';
import { ChapterService } from './chapter.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { ListBookChaptersDto } from './dto/list-book-chapters.dto';
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
    @Body('chapterNumberStart') chapterNumberStart?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const originalName = file.originalname.toLowerCase();
    let content: string;

    if (originalName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else if (originalName.endsWith('.txt')) {
      content = file.buffer.toString('utf-8');
    } else {
      throw new BadRequestException('Only .txt and .docx files are supported');
    }

    return this.chapterService.uploadAndSplitChapters(
      bookId,
      user.sub,
      content,
      {
        sourceFileName: file.originalname,
        sourceFileSize: file.size,
      },
      chapterNumberStart,
    );
  }

  @Get('books/:bookId/chapters')
  listBookChapters(
    @Param('bookId') bookId: string,
    @CurrentUser() user: JwtPayload,
    @Query() query: ListBookChaptersDto,
  ) {
    return this.chapterService.listBookChapters(bookId, user.sub, query);
  }

  @Post('chapters/:id/replace-file')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async replaceChapterFile(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const originalName = file.originalname.toLowerCase();
    let content: string;

    if (originalName.endsWith('.docx')) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      content = result.value;
    } else if (originalName.endsWith('.txt')) {
      content = file.buffer.toString('utf-8');
    } else {
      throw new BadRequestException('Only .txt and .docx files are supported');
    }

    return this.chapterService.replaceChapterSourceFile(
      id,
      user.sub,
      content,
      {
        sourceFileName: file.originalname,
        sourceFileSize: file.size,
      },
    );
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
