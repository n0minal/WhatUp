import { randomUUID } from 'node:crypto';
import express from 'express';

/**
 * twilio-mock — impersonates the two Twilio surfaces WhatUp touches, so the
 * backend runs its REAL HTTP client against a fake carrier:
 *
 *   1. The Messages API (outbound): POST /2010-04-01/Accounts/:sid/Messages.json
 *   2. Webhook delivery (inbound):  POST /simulate/inbound  -> POSTs the
 *      Twilio-shaped form payload to the backend's webhook, with chaos knobs.
 *
 * Chaos knobs (env) — the reason this exists as a separate process. Real
 * Twilio double-delivers and reorders; these make that reproducible:
 *   WEBHOOK_DUPLICATE_PROB   0..1, chance an inbound webhook is delivered twice (default 0)
 *   WEBHOOK_MAX_DELAY_MS     random extra delay per delivery, reorders bursts (default 0)
 */

const PORT = parseInt(process.env.PORT ?? '4010', 10);
const WEBHOOK_URL =
  process.env.WEBHOOK_URL ?? 'http://localhost:3000/webhooks/twilio/sms';
const SERVICE_NUMBER = process.env.SERVICE_NUMBER ?? '+15550000001';
const DUPLICATE_PROB = parseFloat(process.env.WEBHOOK_DUPLICATE_PROB ?? '0');
const MAX_DELAY_MS = parseInt(process.env.WEBHOOK_MAX_DELAY_MS ?? '0', 10);

interface MessageRecord {
  sid: string;
  direction: 'inbound' | 'outbound';
  from: string;
  to: string;
  body: string;
  createdAt: string;
  /** For inbound: HTTP status(es) the webhook delivery returned. */
  webhookResults?: number[];
}

const log: MessageRecord[] = [];
const newSid = () => `SM${randomUUID().replaceAll('-', '')}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---------------------------------------------------------------------------
// Twilio Messages API — what the backend calls to send a reply.
// Path and response shape match real Twilio so the backend's HTTP client
// cannot tell the difference.
// ---------------------------------------------------------------------------
app.post('/2010-04-01/Accounts/:accountSid/Messages.json', (req, res) => {
  const { To: to, From: from, Body: body } = req.body as Record<string, string>;
  if (!to || !from || typeof body !== 'string') {
    res.status(400).json({ code: 21201, message: 'Missing To/From/Body' });
    return;
  }
  const record: MessageRecord = {
    sid: newSid(),
    direction: 'outbound',
    from,
    to,
    body,
    createdAt: new Date().toISOString(),
  };
  log.push(record);
  console.log(`[twilio-mock] SMS to ${to}: "${body}" (${record.sid})`);
  res.status(201).json({
    sid: record.sid,
    status: 'queued',
    to,
    from,
    body,
    date_created: record.createdAt,
  });
});

// ---------------------------------------------------------------------------
// Inbound simulation — "a user texted the service number". Delivers the
// Twilio-shaped webhook to the backend, duplicating/delaying per the knobs.
// ---------------------------------------------------------------------------
async function deliverWebhook(payload: URLSearchParams): Promise<number> {
  if (MAX_DELAY_MS > 0) await sleep(Math.random() * MAX_DELAY_MS);
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload,
    });
    return response.status;
  } catch {
    return 0; // backend unreachable
  }
}

app.post('/simulate/inbound', async (req, res) => {
  const { from, body, to } = req.body as { from?: string; body?: string; to?: string };
  if (!from || typeof body !== 'string') {
    res.status(400).json({ error: 'Expected JSON: { "from": "+1...", "body": "..." }' });
    return;
  }

  const record: MessageRecord = {
    sid: newSid(),
    direction: 'inbound',
    from,
    to: to ?? SERVICE_NUMBER,
    body,
    createdAt: new Date().toISOString(),
    webhookResults: [],
  };
  log.push(record);

  const payload = new URLSearchParams({
    MessageSid: record.sid,
    From: record.from,
    To: record.to,
    Body: record.body,
  });

  const deliveries = [deliverWebhook(payload)];
  const duplicated = Math.random() < DUPLICATE_PROB;
  if (duplicated) {
    console.log(`[twilio-mock] chaos: duplicating webhook for ${record.sid}`);
    deliveries.push(deliverWebhook(payload));
  }
  record.webhookResults = await Promise.all(deliveries);

  console.log(
    `[twilio-mock] inbound from ${from}: "${body}" (${record.sid}) -> webhook ${record.webhookResults.join(', ')}`,
  );
  res.status(202).json({
    messageSid: record.sid,
    duplicated,
    webhookResults: record.webhookResults,
  });
});

// ---------------------------------------------------------------------------
// Inspection — the "phone screen" and a reset for tests.
// ---------------------------------------------------------------------------
app.get('/messages', (req, res) => {
  const phone = req.query.phone as string | undefined;
  const items = phone ? log.filter((m) => m.from === phone || m.to === phone) : log;
  res.json([...items].reverse());
});

app.delete('/messages', (_req, res) => {
  log.length = 0;
  res.status(204).end();
});

app.listen(PORT, () => {
  console.log(`[twilio-mock] listening on :${PORT}`);
  console.log(`[twilio-mock] delivering webhooks to ${WEBHOOK_URL}`);
  console.log(
    `[twilio-mock] chaos: duplicate_prob=${DUPLICATE_PROB} max_delay_ms=${MAX_DELAY_MS}`,
  );
});
