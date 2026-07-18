import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { MESSAGE_QUEUE } from '../queue/tokens';
import { type MessageQueue } from '../queue/types/message-queue';
import { TwilioInboundDto } from './dto/twilio-inbound.dto';

/**
 * The 5-second path. Exactly two things happen here: validate
 * the payload shape, enqueue it. No database — ingestion must survive a
 * Postgres outage, and the 204 must return in milliseconds. If the enqueue
 * throws, Nest returns 500 and Twilio retries: correct behaviour, no cleanup.
 */
@Controller('webhooks/twilio')
export class WebhookController {
  constructor(
    @Inject(MESSAGE_QUEUE)
    private readonly queue: MessageQueue,
  ) {}

  /**
   * @about Accepts a Twilio inbound-SMS webhook and enqueues it for the
   * worker, translating Twilio's field names to the neutral queue payload.
   * @param payload - The validated Twilio webhook body (PascalCase keys).
   * @returns Promise<void> — 204 once the broker has durably accepted the message.
   */
  @Post('sms')
  @HttpCode(204)
  async receiveSms(@Body() payload: TwilioInboundDto): Promise<void> {
    await this.queue.send({
      providerMessageId: payload.MessageSid,
      from: payload.From,
      to: payload.To,
      body: payload.Body,
    });
  }
}
