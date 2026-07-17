# WhatUp Backend

NestJS service for the WhatUp conversational SMS system. One codebase, two run
modes: `api` (Twilio webhook + admin REST) and `worker` (RabbitMQ consumer running
the processing pipeline). Architecture and rationale: [../DESIGN.md](../DESIGN.md).

## Running locally

**One command for the whole stack** (from the repo root — infra, this
service, twilio-mock, and the admin UI in parallel):

```bash
npm run install:all   # first time only
npm run dev
```

Or piece by piece:

```bash
# 1. Infrastructure: Postgres + RabbitMQ (queues asserted by the app on boot)
docker compose up -d          # from the repo root

# 2. Dev Twilio (separate app, impersonates the carrier)
cd ../twilio-mock && npm install && npm run dev    # :4010

# 3. This service (dev default APP_MODE=all runs api + worker in one process)
cp .env.example .env
npm install
npm run start:dev
```

Send a message as a user — from the admin UI (`+ New chat` or the composer in
any conversation), or via the API:

```bash
curl -s -X POST http://localhost:3000/conversations \
  -H 'Content-Type: application/json' \
  -d '{"phoneNumber": "+15551234567", "body": "Hello there"}'
```

Or simulate a carrier-delivered SMS (webhook path, via twilio-mock):

```bash
curl -s -X POST http://localhost:4010/simulate/inbound \
  -H 'Content-Type: application/json' \
  -d '{"from": "+15551234567", "body": "Hello there"}'
```

The webhook acks in milliseconds; 3–15 s later the reply lands back in
twilio-mock (`GET :4010/messages`). Watch the conversation in the admin UI
(`whatup-admin`, live-updates over SSE) or:

```bash
curl -s http://localhost:3000/conversations | python3 -m json.tool
```

## Endpoints

| Endpoint | Purpose |
|---|---|
| `POST /webhooks/twilio/sms` | Twilio inbound webhook — validate, enqueue, 204 |
| `GET /conversations` | Conversation list, most recent first |
| `GET /conversations/:id` | Conversation + messages with per-message status |
| `GET /conversations/events` | SSE change feed — `{ kind: 'change', conversationId }` per message write |
| `POST /conversations` | Send `{ phoneNumber, body }` as a (possibly new) user — enqueue, 202 |
| `POST /conversations/:id/messages` | Send `{ body }` as the conversation's user — enqueue, 202 |

The `POST` send endpoints feed the same queue the webhook does, so a message
sent from the admin UI flows through the real pipeline and gets a generated
reply like any inbound SMS.

## Environment

See [.env.example](.env.example). Notable: `APP_MODE=api|worker|all`,
`MESSAGING_DRIVER=twilio|zenvia|fake`, `REPLY_DRIVER=fake|claude` (LLM replies
via the Claude Agent SDK using the machine's Claude Code login — subscription
usage, no API key), `PROCESSING_MIN_MS`/`MAX_MS` (shrink for fast local
feedback), `STALE_CLAIM_SECONDS`.

## Tests

```bash
npm test
```

Unit tests cover the pipeline's guarantees: duplicate deliveries dropped at
the claim, no resend once a reply is sent, recorded-reply body reused on
retry, failure marking. Constraint behaviour (unique `twilio_sid`,
`in_reply_to`) lives in Postgres and would be integration-tested against the
compose stack (see DESIGN.md §8).
