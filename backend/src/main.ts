import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'error', 'warn'],
  });

  // Log incoming HTTP requests
  app.use((req: any, res: any, next: any) => {
    res.on('finish', () => {
      console.log(`[HTTP] ${req.method} ${req.url} - ${res.statusCode}`);
    });
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.enableCors();

  await app.listen(process.env.PORT ?? 3000, '0.0.0.0');
}

void bootstrap();
