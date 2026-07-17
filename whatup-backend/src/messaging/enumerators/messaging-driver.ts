/** Outbound messaging drivers, selected by MESSAGING_DRIVER. */
export enum MessagingDriver {
  Twilio = 'twilio',
  Zenvia = 'zenvia',
  /** Logs sends in-process — dev/test without any provider. */
  Fake = 'fake',
}
