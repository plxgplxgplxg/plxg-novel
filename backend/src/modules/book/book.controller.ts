import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { BookService } from './book.service';
import { CreateBookDto } from './dto/create-book.dto';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.interface';

@Controller('books')
@UseGuards(AuthGuard('jwt'))
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookDto) {
    return this.bookService.create(user.sub, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookService.findAllByUser(user.sub, {
      search,
      page,
      pageSize,
    });
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.findOneWithChapters(id, user.sub);
  }

  @Get(':id/status')
  getStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.getStatus(id, user.sub);
  }

  @Post(':id/translate')
  @HttpCode(HttpStatus.ACCEPTED)
  startTranslation(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.startTranslation(id, user.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.softDelete(id, user.sub);
  }
}
