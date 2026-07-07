import {
  Controller,
  Get,
  Param,
  UseGuards,
  Res,
  NotFoundException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { OnEvent } from '@nestjs/event-emitter';
import type { Response } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Book } from '../../database/entities/book.entity';
import { CurrentUser } from '../shared/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/jwt-payload.interface';

interface ChapterProgressEvent {
  chapterId: string;
  completed: number;
  total: number;
  percent: number;
  status?: string;
}

@Controller('books')
@UseGuards(AuthGuard('jwt'))
export class ProgressController {
  private readonly sseClients = new Map<string, Response[]>();

  constructor(
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
  ) {}

  @Get(':id/progress-stream')
  async streamProgress(
    @Param('id') bookId: string,
    @CurrentUser() user: JwtPayload,
    @Res() res: Response,
  ): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id: bookId, userId: user.sub } });
    if (!book) throw new NotFoundException('Book not found');

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const clients = this.sseClients.get(bookId) ?? [];
    clients.push(res);
    this.sseClients.set(bookId, clients);

    res.on('close', () => {
      const remaining = (this.sseClients.get(bookId) ?? []).filter((c) => c !== res);
      if (remaining.length === 0) {
        this.sseClients.delete(bookId);
      } else {
        this.sseClients.set(bookId, remaining);
      }
    });
  }

  @OnEvent('chapter.progress')
  handleChapterProgress(event: ChapterProgressEvent): void {
    for (const [bookId, clients] of this.sseClients.entries()) {
      const alive: Response[] = [];
      for (const client of clients) {
        try {
          client.write(`data: ${JSON.stringify({ bookId, ...event })}\n\n`);
          alive.push(client);
        } catch {
          // Client disconnected
        }
      }
      this.sseClients.set(bookId, alive);
    }
  }
}
