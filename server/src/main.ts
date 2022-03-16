import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync, mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { APP_UPLOAD_LOCATION } from './constants/upload_location.constant';
import { RedisIoAdapter } from './middlewares/redis-io.adapter.middleware';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.set('trust proxy');

  app.useWebSocketAdapter(new RedisIoAdapter(app));

  // Create necessary directory
  const facesDirectory = APP_UPLOAD_LOCATION + '/faces';

  if (!existsSync(facesDirectory)) {
    mkdirSync(facesDirectory, { recursive: true });
  }

  await app.listen(3000);
}
bootstrap();
