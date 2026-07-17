/** Queue payload: the webhook's normalized view of an inbound SMS. */
export interface InboundSms {
  messageSid: string;
  from: string;
  to: string;
  body: string;
}
