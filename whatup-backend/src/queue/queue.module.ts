import { Module } from '@nestjs/common';
import { CHANGE_EVENT_BUS, MESSAGE_QUEUE } from './tokens';
import { RabbitMqChangeBusService } from './rabbitmq-change-bus.service';
import { RabbitMqService } from './rabbitmq.service';

@Module({
  providers: [
    RabbitMqService,
    RabbitMqChangeBusService,
    { provide: MESSAGE_QUEUE, useExisting: RabbitMqService },
    { provide: CHANGE_EVENT_BUS, useExisting: RabbitMqChangeBusService },
  ],
  exports: [MESSAGE_QUEUE, CHANGE_EVENT_BUS],
})
export class QueueModule {}
