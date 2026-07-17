import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AppMode } from './config/enumerators/app-mode';

/**
 * One codebase, two run modes (DESIGN.md §1):
 *   APP_MODE=api    -> HTTP server only (webhook + admin REST)
 *   APP_MODE=worker -> RabbitMQ consumer only, no HTTP listener
 *   APP_MODE=all    -> both in one process (local dev default)
 * The RabbitMQ consumer self-starts in worker/all mode (see QueueConsumerService).
 */
async function bootstrap() {
  const mode = (process.env.APP_MODE as AppMode) ?? AppMode.All;

  if (mode === AppMode.Worker) {
    const app = await NestFactory.createApplicationContext(AppModule);
    app.enableShutdownHooks();
    return;
  }

  const app = await NestFactory.create(AppModule);
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
