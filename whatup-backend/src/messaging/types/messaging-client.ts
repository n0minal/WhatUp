export interface SendSmsResult {
  sid: string;
}

export interface MessagingClient {
  sendSms(to: string, body: string): Promise<SendSmsResult>;
}
