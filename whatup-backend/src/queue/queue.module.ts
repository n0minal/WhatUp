import { Module } from '@nestjs/common';
import { MESSAGE_QUEUE } from './tokens';
import { RabbitMqService } from './rabbitmq.service';

@Module({
  providers: [
    RabbitMqService,
    { provide: MESSAGE_QUEUE, useExisting: RabbitMqService },
  ],
  // Only the port is exported: consumers can't couple to the broker class.
  exports: [MESSAGE_QUEUE],
})
export class QueueModule {}
