import type { Conversation, ConversationDetail } from '../types';
import {
  mockGetConversation,
  mockListConversations,
  mockSendSms,
} from './mock';

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
 * When VITE_API_URL is unset the UI runs against in-memory mock data.
 */
const baseUrl: string | undefined = import.meta.env.VITE_API_URL;
const twilioMockUrl: string | undefined = import.meta.env.VITE_TWILIO_MOCK_URL;

export interface SendReceipt {
  messageSid: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
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
  return baseUrl ? get<Conversation[]>('/conversations') : mockListConversations();
}

export function getConversation(id: string): Promise<ConversationDetail> {
  return baseUrl
    ? get<ConversationDetail>(`/conversations/${encodeURIComponent(id)}`)
    : mockGetConversation(id);
}

/**
 * Send an SMS as a user (new or existing conversation — the backend keys
 * conversations by phone number). Goes through twilio-mock, never the
 * backend: the mock delivers the Twilio-shaped webhook, so this is
 * indistinguishable from a real phone texting the service number.
 */
export function sendSms(phoneNumber: string, body: string): Promise<SendReceipt> {
  if (!baseUrl) return mockSendSms(phoneNumber, body);
  if (!twilioMockUrl)
    return Promise.reject(
      new Error('VITE_TWILIO_MOCK_URL is not set — the composer sends through twilio-mock'),
    );
  return post<SendReceipt>(`${twilioMockUrl}/simulate/inbound`, { from: phoneNumber, body });
}

/**
 * Subscribe to the backend's SSE change feed. The callback receives the
 * conversationId of each message write ('*' means anything may have changed).
 * Returns an unsubscribe function. EventSource reconnects automatically.
 * Mock mode has no server to push events, so a 5s interval stands in.
 */
export function subscribeToChanges(onChange: (conversationId: string) => void): () => void {
  if (!baseUrl) {
    const timer = setInterval(() => onChange('*'), 5000);
    return () => clearInterval(timer);
  }
  const source = new EventSource(`${baseUrl}/conversations/events`);
  source.onmessage = (event) => {
    const payload = JSON.parse(event.data as string) as {
      kind: string;
      conversationId?: string;
    };
    if (payload.kind === 'change' && payload.conversationId) onChange(payload.conversationId);
  };
  return () => source.close();
}
