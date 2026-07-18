export type QueueHandler = (body: string) => Promise<void>;

export interface MessageQueue {
  send(payload: object): Promise<void>;
  consume(handler: QueueHandler): Promise<void>;
}
