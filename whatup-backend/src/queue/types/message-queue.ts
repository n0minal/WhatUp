export type QueueHandler = (body: string) => Promise<void>;

/**
 * Port for the message queue (DESIGN.md §6 pattern, same as MessagingClient).
 * The API mode only calls send(); the worker mode only calls consume().
 * The DI container binds a broker adapter (currently RabbitMQ); call sites
 * never know which.
 *
 * Contract: send() resolves only once the broker has durably accepted the
 * message; consume() acks a delivery only after the handler returns, and a
 * handler that throws gets the delivery redelivered later (and eventually
 * dead-lettered).
 */
export interface MessageQueue {
  send(payload: object): Promise<void>;
  consume(handler: QueueHandler): Promise<void>;
}
