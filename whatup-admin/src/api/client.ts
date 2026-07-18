import type { ChangeEvent, SendReceipt } from 'whatup-contracts';
import type { Conversation, ConversationDetail } from '../types';

/**
 * Reads come from whatup-backend; sends go through twilio-mock, which plays
 * Twilio: it webhooks the message at the backend exactly like a real inbound
 * SMS, so the composer takes the same carrier -> webhook -> queue path as a
 * user's phone (chaos knobs included).
 *
 *   GET  {VITE_API_URL}/conversations               -> Conversation[]
 *   GET  {VITE_API_URL}/conversations/:id           -> ConversationDetail
 *   GET  {VITE_API_URL}/conversations/events        -> SSE change feed
 *        data: { kind: 'change', conversationId } | { kind: 'ping' }
 *   POST {VITE_TWILIO_MOCK_URL}/simulate/inbound    -> 202 SendReceipt
 *        { from, body }
 *
 * Both URLs are required — there is no fake-data fallback; the UI always
 * shows the real (initially empty) system state.
 */
const baseUrl: string | undefined = import.meta.env.VITE_API_URL;
const twilioMockUrl: string | undefined = import.meta.env.VITE_TWILIO_MOCK_URL;

export type { SendReceipt } from 'whatup-contracts';

function requireBaseUrl(): string {
  if (!baseUrl)
    throw new Error('VITE_API_URL is not set — start the app with `npm run dev` from the repo root');
  return baseUrl;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${requireBaseUrl()}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(url: string, payload: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST ${url} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

export function listConversations(): Promise<Conversation[]> {
  return get<Conversation[]>('/conversations');
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return get<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`);
}

/**
 * Send an SMS as a user (new or existing conversation — the backend keys
 * conversations by phone number). Goes through twilio-mock, never the
 * backend: the mock delivers the Twilio-shaped webhook, so this is
 * indistinguishable from a real phone texting the service number.
 */
export function sendSms(phoneNumber: string, body: string): Promise<SendReceipt> {
  if (!twilioMockUrl)
    return Promise.reject(
      new Error('VITE_TWILIO_MOCK_URL is not set — the composer sends through twilio-mock'),
    );
  return post<SendReceipt>(`${twilioMockUrl}/simulate/inbound`, { from: phoneNumber, body });
}

/**
 * Subscribe to the backend's SSE change feed. The callback receives the
 * conversationId of each message write. Returns an unsubscribe function.
 * EventSource reconnects automatically.
 */
export function subscribeToChanges(onChange: (conversationId: string) => void): () => void {
  const source = new EventSource(`${requireBaseUrl()}/conversations/events`);
  source.onmessage = (event) => {
    const payload = JSON.parse(event.data as string) as ChangeEvent;
    if (payload.kind === 'change') onChange(payload.conversationId);
  };
  return () => source.close();
}
