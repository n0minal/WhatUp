import { InboundSms } from './types/inbound-sms';

export function parseInboundSms(json: string): InboundSms {
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
