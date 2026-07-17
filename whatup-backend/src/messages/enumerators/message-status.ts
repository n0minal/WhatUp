/** Pipeline state machine: Received -> Processing -> Sent | Failed */
export enum MessageStatus {
  Received = 'received',
  Processing = 'processing',
  Sent = 'sent',
  Failed = 'failed',
}
