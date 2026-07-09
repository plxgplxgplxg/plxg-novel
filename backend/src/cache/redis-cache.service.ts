import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisCacheService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    this.client = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD') || undefined,
      tls: this.configService.get('REDIS_TLS') === 'true' ? {} : undefined,
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableReadyCheck: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client.status === 'wait') {
      this.client.disconnect();
      return;
    }

    await this.client.quit();
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.safeExecute(
      () => this.client.get(key),
      null as string | null,
    );
    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.warn(`Failed to parse cache key ${key}: ${String(error)}`);
      await this.delete(key);
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    await this.safeExecute(async () => {
      await this.client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      return 'OK';
    }, 'OK');
  }

  async getOrSet<T>(
    key: string,
    ttlSeconds: number,
    factory: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async delete(key: string | string[]): Promise<void> {
    const keys = Array.isArray(key) ? key : [key];
    if (keys.length === 0) {
      return;
    }

    await this.safeExecute(async () => {
      await this.client.del(...keys);
      return 1;
    }, 0);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    let cursor = '0';

    do {
      const [nextCursor, keys] = await this.safeExecute(
        () => this.client.scan(cursor, 'MATCH', `${prefix}*`, 'COUNT', 100),
        ['0', []] as [string, string[]],
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        await this.delete(keys);
      }
    } while (cursor !== '0');
  }

  async acquireLock(key: string, ttlMs: number): Promise<string | null> {
    const token = `${Date.now()}:${Math.random().toString(16).slice(2)}`;
    const result = await this.safeExecute(
      () => this.client.set(key, token, 'PX', ttlMs, 'NX'),
      null as string | null,
    );
    return result === 'OK' ? token : null;
  }

  async releaseLock(key: string, token: string): Promise<void> {
    await this.safeExecute(async () => {
      await this.client.eval(
        `
          if redis.call("get", KEYS[1]) == ARGV[1] then
            return redis.call("del", KEYS[1])
          end
          return 0
        `,
        1,
        key,
        token,
      );
      return 1;
    }, 0);
  }

  private async safeExecute<T>(
    operation: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      if (this.client.status === 'wait') {
        await this.client.connect();
      }

      return await operation();
    } catch (error) {
      this.logger.warn(`Redis operation failed: ${String(error)}`);
      return fallback;
    }
  }
}
