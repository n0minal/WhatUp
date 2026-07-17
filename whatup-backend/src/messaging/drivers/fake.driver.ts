import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { MessagingClient, SendSmsResult } from '../types/messaging-client';

/** Dev/test driver: logs the send and fabricates a provider-shaped id. */
@Injectable()
export class FakeDriver implements MessagingClient {
  private readonly logger = new Logger(FakeDriver.name);

  sendSms(to: string, body: string): Promise<SendSmsResult> {
    const sid = `SM${randomUUID().replaceAll('-', '')}`;
    this.logger.log(`[fake] SMS to ${to}: "${body}" (${sid})`);
    return Promise.resolve({ sid });
  }
}
