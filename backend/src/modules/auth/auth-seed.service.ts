import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../../database/entities/user.entity';
import { DEMO_USER_CREDENTIALS } from './demo-users';

const BCRYPT_SALT_ROUNDS = 12;

@Injectable()
export class AuthSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthSeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const shouldSeed = this.configService.get('AUTH_SEED_DEMO_USERS');
    const isProduction = this.configService.get('NODE_ENV') === 'production';

    if (shouldSeed === 'false' || (!shouldSeed && isProduction)) {
      return;
    }

    for (const credential of DEMO_USER_CREDENTIALS) {
      const existingUser = await this.userRepo.findOne({
        where: { email: credential.email },
      });

      if (existingUser) {
        continue;
      }

      const passwordHash = await bcrypt.hash(
        credential.password,
        BCRYPT_SALT_ROUNDS,
      );

      await this.userRepo.save(
        this.userRepo.create({
          email: credential.email,
          passwordHash,
        }),
      );
    }

    this.logger.log(
      `Demo auth accounts ready: ${DEMO_USER_CREDENTIALS.map((user) => user.email).join(', ')}`,
    );
  }
}
