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
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';

@Controller('books')
export class BookController {
  constructor(private readonly bookService: BookService) {}

  @Post()
  @UseGuards(AuthGuard('jwt'))
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookDto) {
    return this.bookService.create(user.sub, dto);
  }

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  findAll(
    @CurrentUser() user: JwtPayload | null,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    return this.bookService.findAllVisibleBooks(user?.sub ?? null, {
      search,
      page,
      pageSize,
    });
  }

  @Get(':id')
  @UseGuards(OptionalJwtAuthGuard)
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload | null) {
    return this.bookService.findOneVisibleWithChapters(id, user?.sub ?? null);
  }

  @Get(':id/status')
  @UseGuards(AuthGuard('jwt'))
  getStatus(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.getStatus(id, user.sub);
  }

  @Post(':id/translate')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.ACCEPTED)
  startTranslation(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.startTranslation(id, user.sub);
  }

  @Delete(':id')
  @UseGuards(AuthGuard('jwt'))
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.bookService.softDelete(id, user.sub);
  }
}
