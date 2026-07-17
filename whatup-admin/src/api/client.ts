import type { Conversation, ConversationDetail } from '../types';
import {
  mockGetConversation,
  mockListConversations,
  mockSendMessage,
  mockStartConversation,
} from './mock';

/**
 * API contract expected from whatup-backend:
 *
 *   GET  {VITE_API_URL}/conversations               -> Conversation[]
 *   GET  {VITE_API_URL}/conversations/:id           -> ConversationDetail
 *   GET  {VITE_API_URL}/conversations/events        -> SSE change feed
 *        data: { kind: 'change', conversationId } | { kind: 'ping' }
 *   POST {VITE_API_URL}/conversations               -> 202 SendReceipt
 *        { phoneNumber, body }
 *   POST {VITE_API_URL}/conversations/:id/messages  -> 202 SendReceipt
 *        { body }
 *
 * When VITE_API_URL is unset the UI runs against in-memory mock data.
 */
const baseUrl: string | undefined = import.meta.env.VITE_API_URL;

export interface SendReceipt {
  messageSid: string;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status} ${res.statusText}`);
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

/** Send a message as the user of an existing conversation. */
export function sendMessage(conversationId: string, body: string): Promise<SendReceipt> {
  return baseUrl
    ? post<SendReceipt>(`/conversations/${encodeURIComponent(conversationId)}/messages`, { body })
    : mockSendMessage(conversationId, body);
}

/** Send a message as a (possibly new) user, keyed by phone number. */
export function startConversation(phoneNumber: string, body: string): Promise<SendReceipt> {
  return baseUrl
    ? post<SendReceipt>('/conversations', { phoneNumber, body })
    : mockStartConversation(phoneNumber, body);
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
