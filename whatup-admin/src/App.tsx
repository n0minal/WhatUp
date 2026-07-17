import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { listConversations } from './api/client';
import { Brand } from './components/Brand';
import { ChatView } from './components/ChatView';
import { ConversationList } from './components/ConversationList';
import { useLiveQuery } from './lib/useLiveQuery';

// Served from public/ — same file the favicon uses (index.html).
const logoUrl = '/whatup-logo.png';

function EmptyState() {
  return (
    <div className="chat chat--empty">
      <img src={logoUrl} alt="" width={120} height={120} />
      <h2>WhatUp Admin</h2>
      <p>Select a conversation to inspect its messages and delivery status.</p>
    </div>
  );
}

export default function App() {
  const { data, error, loading, refresh } = useLiveQuery(listConversations);

  return (
    <BrowserRouter>
      <div className="app">
        <aside className="sidebar">
          <header className="sidebar__header">
            <Brand />
          </header>
          <ConversationList
            conversations={data}
            loading={loading}
            error={error}
            onChanged={refresh}
          />
        </aside>
        <main className="main">
          <Routes>
            <Route path="/" element={<EmptyState />} />
            <Route path="/conversations/:id" element={<ChatView />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
