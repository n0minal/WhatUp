/**
 * Queue payload: the webhook's normalized view of an inbound SMS. The
 * carrier-specific id (Twilio MessageSid) is translated to the neutral
 * providerMessageId at the webhook seam.
 */
export interface InboundSms {
  providerMessageId: string;
  from: string;
  to: string;
  body: string;
}
