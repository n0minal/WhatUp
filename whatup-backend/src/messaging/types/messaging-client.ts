export interface SendSmsResult {
  /** Provider message id of the accepted outbound message (Twilio: MessageSid). */
  sid: string;
}

/**
 * Port for outbound messaging (DESIGN.md §6). Named for the capability, not
 * the technology: the DI container binds one of the drivers in ./drivers
 * (Twilio, Zenvia, or the in-process fake) selected by MESSAGING_DRIVER, and
 * call sites never know which. A new provider is one new driver class plus a
 * case in the MessagingModule binding.
 */
export interface MessagingClient {
  sendSms(to: string, body: string): Promise<SendSmsResult>;
}
