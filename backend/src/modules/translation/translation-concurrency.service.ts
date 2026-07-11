import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const DEFAULT_MAX_IN_FLIGHT = 4;
const MIN_MAX_IN_FLIGHT = 1;
const MAX_MAX_IN_FLIGHT = 8;
const WAIT_INTERVAL_MS = 25;

@Injectable()
export class TranslationConcurrencyService {
  private activeCount = 0;
  private readonly maxInFlight: number;

  constructor(private readonly configService: ConfigService) {
    this.maxInFlight = this.resolveMaxInFlight();
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    await this.acquire();

    try {
      return await task();
    } finally {
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
  }

  private async acquire(): Promise<void> {
    while (this.activeCount >= this.maxInFlight) {
      await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
    }

    this.activeCount += 1;
  }

  private resolveMaxInFlight(): number {
    const configuredValue = Number.parseInt(
      this.configService.get<string>('TRANSLATION_MAX_IN_FLIGHT') ?? '',
      10,
    );

    if (Number.isNaN(configuredValue)) return DEFAULT_MAX_IN_FLIGHT;

    return Math.min(
      MAX_MAX_IN_FLIGHT,
      Math.max(MIN_MAX_IN_FLIGHT, configuredValue),
    );
  }
}
