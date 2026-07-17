import { Module } from '@nestjs/common';
import { MessagesModule } from '../messages/messages.module';
import { QueueModule } from '../queue/queue.module';
import { QueueConsumerService } from './queue-consumer.service';

@Module({
  imports: [QueueModule, MessagesModule],
  providers: [QueueConsumerService],
})
export class WorkerModule {}
