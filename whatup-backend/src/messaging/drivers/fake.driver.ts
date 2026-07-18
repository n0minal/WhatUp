import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MessagingClient, SendSmsResult } from '../types/messaging-client';

/** Dev/test driver: logs the send and fabricates a provider-shaped id. */
@Injectable()
export class FakeDriver implements MessagingClient {
  private readonly logger = new Logger(FakeDriver.name);

  /**
   * @about Pretends to send an SMS: logs it and fabricates a provider-shaped
   * id, so the pipeline runs end to end without credentials.
   * @param to - The recipient phone number (E.164).
   * @param body - The text of the message.
   * @returns A fabricated provider message id (SM + 32 hex chars).
   */
  sendSms(to: string, body: string): Promise<SendSmsResult> {
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    this.logger.log(`[fake] SMS to ${to}: "${body}" (${sid})`);
    return Promise.resolve({ sid });
  }
}
