import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Book } from '../../database/entities/book.entity';
import { ProgressController } from './progress.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Book])],
  controllers: [ProgressController],
})
export class ProgressModule {}
