# WhatUp Admin

Admin frontend for the WhatUp conversational SMS system. Read-only view over
conversations and messages: browse conversations, open one, inspect every
inbound/outbound message and its delivery status
(`received → processing → sent | failed`).

Built with Vite + React + TypeScript. No component library — hand-rolled CSS
anchored to the WhatUp brand gradient.

## Running

```bash
npm install
npm run dev        # http://localhost:5173
```

With no configuration the app serves **in-memory mock data** so it runs
standalone. To point it at the real backend:

```bash
VITE_API_URL=http://localhost:3000 npm run dev
```

## API contract (expected from whatup-backend)

| Endpoint | Returns |
|---|---|
| `GET /conversations` | `Conversation[]` — sorted by `lastMessageAt` desc |
| `GET /conversations/:id` | `ConversationDetail` — conversation + messages, oldest first |

Types live in [`src/types.ts`](src/types.ts); the fetch layer and mock
fallback in [`src/api/`](src/api/).

Views poll every 5 seconds (message statuses transition server-side), keeping
stale data on screen between refreshes.

## Structure

```
src/
├── api/          # typed client + mock fallback (swap via VITE_API_URL)
├── components/   # Brand, ConversationList, ChatView, StatusIndicator
├── lib/          # date/phone formatting, polling hook
├── types.ts      # API contract types
└── App.tsx       # routes: / and /conversations/:id
```
