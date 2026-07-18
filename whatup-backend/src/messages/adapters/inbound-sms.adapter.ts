import { InboundSms } from '../types/inbound-sms';

/**
 * Boundary adapter for the raw queue payload: parses the delivery body and
 * validates its shape. Throwing here follows the delivery's failure path
 * (redeliver, then DLQ) — a malformed payload must never reach the pipeline.
 */
export class InboundSmsAdapter {
  public static toModel(json: string): InboundSms {
    const raw = JSON.parse(json) as Partial<InboundSms>;
    if (
      !raw.providerMessageId ||
      !raw.from ||
      !raw.to ||
      typeof raw.body !== 'string'
    ) {
      throw new Error(`Malformed queue payload: ${json}`);
    }
    return {
      providerMessageId: raw.providerMessageId,
      from: raw.from,
      to: raw.to,
      body: raw.body,
    };
  }
}
