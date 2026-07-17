import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { MessagingClient, SendSmsResult } from '../types/messaging-client';

/**
 * Twilio driver for the MessagingClient port. Points at real Twilio in
 * production and at the twilio-mock service in dev — same code path, only
 * TWILIO_API_BASE_URL differs.
 */
@Injectable()
export class TwilioDriver implements MessagingClient {
  private readonly apiBaseUrl: string;
  private readonly accountSid: string;
  private readonly authToken: string;
  private readonly fromNumber: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const twilio = config.get('twilio', { infer: true });
    this.apiBaseUrl = twilio.apiBaseUrl;
    this.accountSid = twilio.accountSid;
    this.authToken = twilio.authToken;
    this.fromNumber = twilio.fromNumber;
  }

  async sendSms(to: string, body: string): Promise<SendSmsResult> {
    const url = `${this.apiBaseUrl}/2010-04-01/Accounts/${this.accountSid}/Messages.json`;
    const auth = Buffer.from(`${this.accountSid}:${this.authToken}`).toString(
      'base64',
    );
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ To: to, From: this.fromNumber, Body: body }),
    });
    if (!response.ok) {
      throw new Error(
        `Twilio send failed: ${response.status} ${await response.text()}`,
      );
    }
    const result = (await response.json()) as { sid: string };
    return { sid: result.sid };
  }
}
