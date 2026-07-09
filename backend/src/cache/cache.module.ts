import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NovelCacheService } from './novel-cache.service';
import { RedisCacheService } from './redis-cache.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisCacheService, NovelCacheService],
  exports: [RedisCacheService, NovelCacheService],
})
export class CacheModule {}
