import { Module } from '@nestjs/common';
import { QueueModule } from '../queue/queue.module';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [QueueModule],
  controllers: [WebhookController],
})
export class WebhookModule {}
