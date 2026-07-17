import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  MessageEvent,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Observable } from 'rxjs';
import { AppConfig } from '../config/configuration';
import { MESSAGE_QUEUE } from '../queue/tokens';
import { type MessageQueue } from '../queue/types/message-queue';
import { ChangeStreamService } from './change-stream.service';
import { ConversationsService } from './conversations.service';
import { SendMessageDto, StartConversationDto } from './dto/send-message.dto';
import {
  ConversationDetail,
  ConversationSummary,
} from './types/conversation-views';

/**
 * Admin API — consumed by whatup-admin, which refetches on SSE change events
 * (GET /conversations/events).
 *
 * The POST endpoints let a user send a message without a phone: the payload
 * is enqueued exactly like a Twilio webhook delivery (enqueue-first, no
 * Postgres write — DESIGN.md §2) and flows through the identical pipeline,
 * so the generated reply and status transitions appear via the read API.
 * 202: the message is durably queued, not yet processed.
 */
@Controller('conversations')
export class ConversationsController {
  private readonly systemNumber: string;

  constructor(
    private readonly conversations: ConversationsService,
    private readonly changeStream: ChangeStreamService,
    @Inject(MESSAGE_QUEUE) private readonly queue: MessageQueue,
    config: ConfigService<AppConfig, true>,
  ) {
    this.systemNumber = config.get('twilio', { infer: true }).fromNumber;
  }

  @Get()
  list(): Promise<ConversationSummary[]> {
    return this.conversations.list();
  }

  /**
   * SSE change feed: {kind:'change', conversationId} on every message write,
   * plus keepalive pings. Declared before :id so the static path wins.
   */
  @Sse('events')
  events(): Observable<MessageEvent> {
    return this.changeStream.sseEvents();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string): Promise<ConversationDetail> {
    return this.conversations.get(id);
  }

  /** Send a message as a (possibly new) user, keyed by phone number. */
  @Post()
  @HttpCode(202)
  async startConversation(
    @Body() dto: StartConversationDto,
  ): Promise<{ messageSid: string }> {
    return this.enqueueInbound(dto.phoneNumber, dto.body);
  }

  /** Send a message as the user of an existing conversation. */
  @Post(':id/messages')
  @HttpCode(202)
  async sendMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SendMessageDto,
  ): Promise<{ messageSid: string }> {
    const phoneNumber = await this.conversations.phoneNumberOf(id);
    return this.enqueueInbound(phoneNumber, dto.body);
  }

  private async enqueueInbound(
    from: string,
    body: string,
  ): Promise<{ messageSid: string }> {
    // App-originated sid: unique per send (it is the idempotency key), and
    // the WU prefix distinguishes it from Twilio's SM... sids.
    const messageSid = `WU${randomUUID().replace(/-/g, '')}`;
    await this.queue.send({
      messageSid,
      from,
      to: this.systemNumber,
      body,
    });
    return { messageSid };
  }
}
