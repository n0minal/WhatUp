# twilio-mock

Standalone Twilio impersonator for local development. The backend runs its
**real HTTP Twilio client** against this process — same paths, same response
shapes — so the integration code is exercised end-to-end without a Twilio
account.

## Running

```bash
npm install
npm run dev        # listens on :4010
```

## Surfaces

| Endpoint | Role |
|---|---|
| `POST /2010-04-01/Accounts/:sid/Messages.json` | Twilio Messages API — the backend's replies land here (form-encoded, 201 + `sid`) |
| `POST /simulate/inbound` | "A user texted the number": delivers the Twilio-shaped webhook to the backend |
| `GET /messages[?phone=+1...]` | Message log, newest first — the phone screen |
| `DELETE /messages` | Reset the log |

Simulate a user sending an SMS:

```bash
curl -s -X POST http://localhost:4010/simulate/inbound \
  -H 'Content-Type: application/json' \
  -d '{"from": "+15551234567", "body": "Hello!"}'
```

…then watch the reply arrive (3–15 s later):

```bash
curl -s "http://localhost:4010/messages?phone=+15551234567"
```

## Chaos knobs (env)

Real Twilio double-delivers webhooks and doesn't guarantee ordering. These
make that reproducible — the backend's idempotency and ordering handling can
be demonstrated, not just claimed:

| Variable | Default | Effect |
|---|---|---|
| `WEBHOOK_DUPLICATE_PROB` | `0` | Probability (0–1) an inbound webhook is delivered twice |
| `WEBHOOK_MAX_DELAY_MS` | `0` | Random per-delivery delay; reorders bursts of messages |
| `WEBHOOK_URL` | `http://localhost:3000/webhooks/twilio/sms` | Where webhooks are delivered |
| `SERVICE_NUMBER` | `+15550000001` | The WhatUp phone number |
| `PORT` | `4010` | Listen port |

Configuration is read from a `.env` file in this directory (or from the
process environment). `cp .env.example .env` enables always-duplicate mode:
every simulated inbound hits the backend twice, and the conversation should
still show exactly one reply.

```bash
cp .env.example .env
npm run dev
```
