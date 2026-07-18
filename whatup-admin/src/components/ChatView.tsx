import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { getConversation, sendSms } from '../api/client';
import { useLiveQuery } from '../lib/useLiveQuery';
import type { Message } from '../types';
import { avatarInitials, formatDayLabel, formatPhoneNumber, formatTime, isSameDay } from '../lib/format';
import { StatusIndicator } from './StatusIndicator';

function MessageBubble({ message }: { message: Message }) {
  return (
    <div className={`bubble bubble--${message.direction}`}>
      <p className="bubble__body">{message.body}</p>
      <span className="bubble__meta">
        <time>{formatTime(message.createdAt)}</time>
        <StatusIndicator status={message.status} />
      </span>
    </div>
  );
}

function Composer({ phoneNumber, onSent }: { phoneNumber: string; onSent: () => void }) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendSms(phoneNumber, body);
      setDraft('');
      onSent();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  };

  return (
    <form className="composer" onSubmit={submit}>
      {error && <p className="composer__error">{error}</p>}
      <div className="composer__row">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Send a message as this user…"
          aria-label="Message body"
          disabled={sending}
        />
        <button type="submit" disabled={sending || !draft.trim()}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export function ChatView() {
  const { id } = useParams<{ id: string }>();
  const fetcher = useCallback(() => getConversation(id!), [id]);
  // The SSE change feed re-fetches when this conversation gets a write —
  // including the send path: 202 means "queued", and the row appears once
  // the worker persists it, which is exactly when the feed fires.
  const { data, error, loading, refresh } = useLiveQuery(
    fetcher,
    (conversationId) => conversationId === id,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastMessageId = data?.messages.at(-1)?.id;

  // Pin to the latest message when the conversation loads or grows.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastMessageId]);

  if (loading) return <div className="chat chat--empty">Loading conversation…</div>;
  if (error) return <div className="chat chat--empty chat--error">{error}</div>;
  if (!data) return null;

  const { conversation, messages } = data;

  return (
    <div className="chat">
      <header className="chat__header">
        <span className="avatar avatar--sm">{avatarInitials(conversation.phoneNumber)}</span>
        <div className="chat__peer">
          <h2>{formatPhoneNumber(conversation.phoneNumber)}</h2>
          <p>
            {conversation.messageCount} message{conversation.messageCount === 1 ? '' : 's'}
          </p>
        </div>
      </header>

      <div className="chat__scroll" ref={scrollRef}>
        <div className="chat__messages">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const showDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
            return (
              <div key={m.id}>
                {showDay && <div className="chat__day">{formatDayLabel(m.createdAt)}</div>}
                <MessageBubble message={m} />
              </div>
            );
          })}
        </div>
      </div>

      <Composer phoneNumber={conversation.phoneNumber} onSent={refresh} />
    </div>
  );
}
