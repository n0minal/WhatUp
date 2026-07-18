<p align="center">
  <img src="whatup-admin/public/whatup-logo.png" alt="WhatUp logo" width="140" />
</p>

<h1 align="center">WhatUp</h1>

<p align="center"><em>What if WhatsApp and iMessage had a child?</em></p>

<p align="center">
  Meet WhatUp: it inherited its mother's obsession with being on every phone on Earth
  and its father's refusal to make anything that isn't a blue bubble.
  It's SMS, which means it also inherited something from a grandparent nobody talks about.
</p>

---

WhatUp is a conversational SMS platform. You text it, it thinks about what you said for
3-15 seconds (it was raised to think before it speaks), and it texts you back. Every
message. Always. Exactly once. An admin web app lets you watch every conversation update
live, like a helicopter parent with a dashboard.

## Demo

<!-- ────────────────────────────────────────────────────────────────────────
  RESERVED: demo videos.
  GitHub renders videos that are uploaded through the web editor. Open this
  file on github.com, click the pencil, and drag each .mp4/.mov onto the line
  below its heading. GitHub replaces it with a hosted user-attachments URL.
──────────────────────────────────────────────────────────────────────── -->

### The app

<!-- Drop the UI walkthrough video here: composer → 3-15 s "processing" → reply arrives live via SSE. -->

*Video coming soon. The child is camera-shy.*

### The observability dashboard

<!-- Drop the Grafana walkthrough video here: the WhatUp Overview dashboard, a trace end-to-end, trace-correlated logs. -->

*Video coming soon. Yes, we film our own dashboard. We watch our messages harder than you watch yours.*

## Features

- **Blue bubbles for everyone.** No green-bubble caste system. Every conversation gets the
  gradient. This was a custody condition.
- **It always texts back.** Send an SMS, get a reply in 3-15 seconds. Needy? Yes.
  Unreliable? Never.
- **It never loses a message.** Failed processing is retried with a delay, and after three
  strikes the message is sent to the dead-letter queue, which is like therapy for
  messages. Nothing is dropped; some things just need time.
- **Double-texting is safe.** Send the same message twice, or let the carrier deliver it
  twice: Postgres constraints make sure exactly one reply goes out. WhatUp does not
  double-text. It has that from neither parent. (Our mock carrier randomly duplicates
  webhook deliveries *on purpose*, because real carriers do it by accident.)
- **A helicopter-parent admin UI.** Every conversation, live-updated over SSE. You see the
  message arrive, you see it *processing…*, you see the reply. Read receipts for the
  read receipts.
- **Optional AI replies.** Flip `REPLY_DRIVER=claude` and the replies come from Claude
  instead of the built-in keyword bot. The child is gifted.
- **Fully observed.** Traces, metrics, and logs for every message's journey, with a
  provisioned Grafana dashboard. See [OBSERVABILITY.md](OBSERVABILITY.md).

## How it works

Every message, including the ones you send from the admin UI, travels through the
(mock) carrier. Nobody skips the line.

```mermaid
flowchart LR
  UI[Admin UI] -- "send SMS" --> TW[twilio-mock]
  TW -- "webhook" --> API[API]
  API -- "enqueue" --> MQ[(RabbitMQ)]
  MQ --> WK[Worker]
  WK -- "persist + reply" --> DB[(Postgres)]
  WK -- "send reply" --> TW
  WK -. "change hint" .-> API
  API -. "SSE" .-> UI
```

The webhook answers in milliseconds and enqueues; the worker claims each message
atomically, generates the reply, sends it back through the carrier, and records
everything in Postgres, which is the arbiter of idempotency, ordering, and truth.
The full architecture, trade-offs, and failure walkthroughs live in
[DESIGN.md](DESIGN.md).

## The stack

Both parents were consulted. Neither approved.

| Layer | Tech |
| --- | --- |
| Backend | [NestJS](https://nestjs.com) 11 on Node 20+, TypeScript end to end |
| Database | PostgreSQL 16 with [TypeORM](https://typeorm.io): entities for schema, raw SQL where the guarantees live |
| Queueing | RabbitMQ 4 via `amqplib`: a durable work queue for the pipeline, a fanout exchange for live updates |
| Frontend | React 19 + Vite, live-updated over Server-Sent Events (`EventSource`) |
| Shared types | `whatup-contracts`, an npm-workspaces package both apps import, so the wire contract is a compile error, not a runtime surprise |
| Carrier | Express (`twilio-mock`), speaking Twilio's webhook and Messages API dialects |
| AI replies | [Claude Agent SDK](https://code.claude.com/docs/en/agent-sdk) (`REPLY_DRIVER=claude`) |
| Observability | OpenTelemetry SDK (auto-instrumented http/express/pg/amqplib + custom spans and metrics) → [grafana/otel-lgtm](https://github.com/grafana/docker-otel-lgtm): Grafana, Prometheus, Tempo, Loki in one container |
| Infra | Docker Compose for Postgres, RabbitMQ, and the observability stack |
| Quality | Jest (87 unit + 26 integration tests), ESLint + Prettier, `class-validator` at the HTTP boundary |

## The grown-up concepts

The jokes stop here for a minute. Under the gradient, WhatUp is a distributed-systems
exercise, and these are the ideas doing the work, each one detailed in
[DESIGN.md](DESIGN.md):

- **Enqueue-first ingestion.** The webhook validates and enqueues, with no database in
  the path, so it answers in milliseconds, survives a Postgres outage, and beats carrier
  webhook timeouts. If the broker is down it returns 500 and the carrier retries: the
  failure mode *is* the retry mechanism. (§2)
- **Idempotency, because duplicates are the normal case.** Carriers re-POST, queues
  redeliver, workers crash mid-flight. Three Postgres constraints make all of it safe: a
  unique `provider_message_id` collapses duplicate deliveries onto one row, an atomic
  claim (`UPDATE … WHERE status IN (…)`) lets exactly one worker process it, and a unique
  `in_reply_to` guarantees at most one reply per inbound message. The database is the
  arbiter; application memory is not invited. (§4)
- **Retries with delay.** A failed delivery is republished to a TTL retry queue whose
  expiry dead-letters it back to the main queue: redelivery-after-delay without a
  scheduler. (§3)
- **Dead-letter queue.** Three strikes and the message is parked in
  `whatup-inbound.dlq` with its attempt history: never dropped, never poison-looping,
  waiting for an operator. (§3)
- **Stale-claim takeover.** A worker that dies after claiming a message holds the claim
  only for `STALE_CLAIM_SECONDS`; after that any worker may take the row over. Crashed
  workers don't strand messages. (§4)
- **Ports & adapters.** The pipeline depends on `MessageQueue`, `MessagingClient`,
  `ReplyGenerator`, and `ChangeEventBus` interfaces; RabbitMQ, Twilio/Zenvia/fake, and
  Claude/fake are swappable drivers behind DI tokens. Repositories own all SQL; adapters
  translate rows at every boundary. (§6)
- **Live updates without polling.** Every write publishes a data-free *change hint* to a
  RabbitMQ fanout exchange; every API instance forwards it to its SSE clients, which
  re-fetch. Hints are best-effort by contract: losing one costs staleness, never
  correctness. At production scale this becomes CDC. (§6, §9)
- **Horizontal scaling.** One codebase, `APP_MODE=api|worker|all`, so ingestion and
  processing scale independently; prefetch bounds per-worker concurrency. (§1, §9)
- **Observability as a feature.** One distributed trace follows a message from webhook
  through the queue (context propagated in message headers) to reply generation and the
  outbound send; RED-style metrics (throughput by outcome, latency histograms, queue
  depths) and trace-correlated logs land in a provisioned Grafana dashboard.
  ([OBSERVABILITY.md](OBSERVABILITY.md))
- **Tests that earn their keep.** Unit tests mock the ports; integration tests hit real
  Postgres to prove the concurrency invariants (8 concurrent claimers, one winner),
  because mocks return whatever shape you assumed. That suite caught a real bug. (§8)

## The family tree

| Package | What it is |
| --- | --- |
| [`whatup-backend`](whatup-backend) | NestJS API + worker. The responsible one. |
| [`whatup-admin`](whatup-admin) | React admin UI. Got its father's looks. |
| [`twilio-mock`](twilio-mock) | A tiny Twilio impersonator so you can run the whole carrier loop locally. Legally distinct. |
| [`whatup-contracts`](whatup-contracts) | Shared TypeScript types, so the frontend and backend never argue about what a message is. |
| [`observability/`](observability) | Grafana dashboard + datasource provisioning. The family photo album. |

## Quickstart

You need **Node 20+** and **Docker**.

```bash
npm install                                    # installs all workspaces, builds the shared contracts
cp whatup-backend/.env.example whatup-backend/.env
npm run dev                                    # postgres + rabbitmq (docker) + backend + twilio-mock + admin UI
```

Then open:

| URL | What's there |
| --- | --- |
| http://localhost:5173 | Admin UI. Pick a phone number and start texting |
| http://localhost:3000 | Backend API (webhook + read-only admin endpoints + SSE) |
| http://localhost:4010 | twilio-mock |
| http://localhost:15672 | RabbitMQ management (`whatup` / `whatup`) |

### Send your first message

Use the composer in the admin UI, where you're playing the phone. Or be the carrier yourself:

```bash
curl -X POST http://localhost:4010/simulate/inbound \
  -H 'Content-Type: application/json' \
  -d '{"from": "+15550001111", "body": "hello?"}'
```

Watch the conversation appear in the UI, sit in *processing…* for 3-15 seconds, and get
its reply. The default reply bot understands `BOOK` and `CANCEL` and politely echoes
everything else. It is not a good conversationalist. That's what the Claude driver is for
(`REPLY_DRIVER=claude` in `whatup-backend/.env`; see the notes in `.env.example`).

### Watch it being watched

```bash
npm run obs        # Grafana + Prometheus + Tempo + Loki, one container
```

Grafana is at http://localhost:3001, and the **WhatUp Overview** dashboard is the home
page: throughput, reply latency, queue depths, live traces, and trace-correlated logs.
Full tour, credentials, and troubleshooting in [OBSERVABILITY.md](OBSERVABILITY.md).

### Tests

```bash
npm test                    # unit suite (mocked ports and adapters)
npm run test:integration    # repository guarantees against real Postgres, in a throwaway whatup_test DB
```

### All the scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start everything (infra + backend + twilio-mock + admin) |
| `npm run obs` / `npm run obs:down` | Start / stop the observability stack (Grafana data survives) |
| `npm run db:purge` | Wipe messages, conversations, and queues. A fresh start, no questions asked |
| `npm test` | Unit tests |
| `npm run test:integration` | Integration tests against real Postgres |

---

<p align="center">
  <sub>
    WhatUp is a parody and is not affiliated with, endorsed by, or texting either of its
    parents (Meta's WhatsApp or Apple's iMessage). It was born as a take-home technical
    assessment; the original brief lives in <a href="ASSESSMENT.md">ASSESSMENT.md</a>,
    and the engineering it grew into lives in <a href="DESIGN.md">DESIGN.md</a>.
  </sub>
</p>
