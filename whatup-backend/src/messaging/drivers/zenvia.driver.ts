import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { MessagingClient, SendSmsResult } from '../types/messaging-client';

/**
 * Zenvia driver for the MessagingClient port (SMS channel of the Zenvia
 * v2 API: POST /v2/channels/sms/messages, X-API-TOKEN auth).
 */
@Injectable()
export class ZenviaDriver implements MessagingClient {
  private readonly apiBaseUrl: string;
  private readonly apiToken: string;
  private readonly fromNumber: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const zenvia = this.config.get('zenvia', { infer: true });
    this.apiBaseUrl = zenvia.apiBaseUrl;
    this.apiToken = zenvia.apiToken;
    this.fromNumber = zenvia.fromNumber;
  }

  /**
   * @about Sends an SMS through Zenvia's v2 SMS channel with token auth,
   * mapping Zenvia's message id onto the neutral sid.
   * @param to - The recipient phone number (E.164).
   * @param body - The text of the message.
   * @returns The provider message id of the accepted send.
   * @throws Error with the HTTP status and response text when Zenvia rejects the send.
   */
  async sendSms(to: string, body: string): Promise<SendSmsResult> {
    const response = await fetch(
      `${this.apiBaseUrl}/v2/channels/sms/messages`,
      {
        method: 'POST',
        headers: {
          'X-API-TOKEN': this.apiToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: this.fromNumber,
          to,
          contents: [{ type: 'text', text: body }],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(
        `Zenvia send failed: ${response.status} ${await response.text()}`,
      );
    }
    const result = (await response.json()) as { id: string };
    return { sid: result.id };
  }
}
