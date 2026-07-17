import { InboundSms } from './types/inbound-sms';

export function parseInboundSms(json: string): InboundSms {
  const raw = JSON.parse(json) as Partial<InboundSms>;
  if (!raw.messageSid || !raw.from || !raw.to || typeof raw.body !== 'string') {
    throw new Error(`Malformed queue payload: ${json}`);
  }
  return {
    messageSid: raw.messageSid,
    from: raw.from,
    to: raw.to,
    body: raw.body,
  };
}
