import { useMemo, useState, type FormEvent } from 'react';
import { NavLink } from 'react-router-dom';
import { startConversation } from '../api/client';
import type { Conversation } from '../types';
import { avatarInitials, formatListTimestamp, formatPhoneNumber } from '../lib/format';

function ConversationRow({ conversation }: { conversation: Conversation }) {
  return (
    <NavLink
      to={`/conversations/${conversation.id}`}
      className={({ isActive }) => `convo-row${isActive ? ' convo-row--active' : ''}`}
    >
      <span className="avatar">{avatarInitials(conversation.phoneNumber)}</span>
      <span className="convo-row__body">
        <span className="convo-row__top">
          <span className="convo-row__number">{formatPhoneNumber(conversation.phoneNumber)}</span>
          <time className="convo-row__time">{formatListTimestamp(conversation.lastMessageAt)}</time>
        </span>
        <span className="convo-row__bottom">
          <span className="convo-row__preview">{conversation.lastMessagePreview}</span>
          <span className="convo-row__count">{conversation.messageCount}</span>
        </span>
      </span>
    </NavLink>
  );
}

function NewChat({ onStarted }: { onStarted: () => void }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    try {
      await startConversation(phone.trim(), body.trim());
      setPhone('');
      setBody('');
      setOpen(false);
      onStarted();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    setSending(false);
  };

  if (!open) {
    return (
      <div className="newchat">
        <button type="button" className="newchat__toggle" onClick={() => setOpen(true)}>
          + New chat
        </button>
      </div>
    );
  }

  return (
    <form className="newchat newchat--open" onSubmit={submit}>
      {error && <p className="newchat__error">{error}</p>}
      <input
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Phone number, e.g. +15551234567"
        aria-label="Phone number"
        pattern="^\+[1-9]\d{6,14}$"
        required
        disabled={sending}
      />
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="First message"
        aria-label="First message"
        required
        disabled={sending}
      />
      <div className="newchat__actions">
        <button type="button" onClick={() => setOpen(false)} disabled={sending}>
          Cancel
        </button>
        <button type="submit" className="newchat__send" disabled={sending}>
          {sending ? 'Sending…' : 'Send'}
        </button>
      </div>
    </form>
  );
}

export function ConversationList({
  conversations,
  loading,
  error,
  onChanged,
}: {
  conversations: Conversation[] | null;
  loading: boolean;
  error: string | null;
  onChanged: () => void;
}) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    if (!conversations) return null;
    const q = query.replace(/\D/g, '');
    if (!q) return conversations;
    return conversations.filter((c) => c.phoneNumber.replace(/\D/g, '').includes(q));
  }, [conversations, query]);

  return (
    <>
      <div className="sidebar__search">
        <svg viewBox="0 0 16 16" aria-hidden="true" className="sidebar__search-icon">
          <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="search"
          placeholder="Search by phone number"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search conversations by phone number"
        />
      </div>

      <NewChat onStarted={onChanged} />

      <nav className="sidebar__list" aria-label="Conversations">
        {loading && <p className="sidebar__hint">Loading conversations…</p>}
        {error && <p className="sidebar__hint sidebar__hint--error">{error}</p>}
        {filtered?.length === 0 && <p className="sidebar__hint">No conversations match.</p>}
        {filtered?.map((c) => <ConversationRow key={c.id} conversation={c} />)}
      </nav>
    </>
  );
}
