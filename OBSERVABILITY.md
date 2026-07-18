# Observability

WhatUp ships with opt-in OpenTelemetry instrumentation and a self-contained
Grafana stack. One message produces one distributed trace — webhook → RabbitMQ
→ worker → Postgres → reply driver → Twilio send — plus metrics for every
pipeline outcome, on a dashboard styled with the admin UI's palette.

## Quick start

```bash
# 1. Start the observability stack (Grafana + Prometheus + Tempo + Loki, one container)
docker compose --profile obs up -d

# 2. Point the backend at it (whatup-backend/.env)
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=whatup-backend

# 3. Run the apps and send a few messages through the admin UI
npm run dev
```

Open **http://localhost:3001** → dashboards → **WhatUp / WhatUp — Overview**.

- **Credentials:** none needed — anonymous access with the Admin role is
  enabled for the demo (`GF_AUTH_ANONYMOUS_*` in `docker-compose.yml`). If you
  land on a login screen anyway, the image default is `admin` / `admin`.
- **Off by default:** without `OTEL_EXPORTER_OTLP_ENDPOINT` the SDK never
  starts and every instrument is a no-op — `npm run dev` without the profile
  runs exactly as before, zero overhead.

## What you get

### Traces (Tempo)

`src/observability/otel.ts` boots the Node SDK before anything else is
required, so auto-instrumentation patches `http`, `express`, `pg`, and
`amqplib`. The amqplib instrumentation propagates trace context **through
message headers**, so the API's webhook span and the worker's consume span
join the same trace even when they are separate processes (`APP_MODE=api` +
`worker`). A typical trace (~45 spans) reads:

```
POST /webhooks/twilio/sms            (API)
└─ publish whatup-inbound            (enqueue-first, broker-confirmed)
   └─ whatup-inbound process         (worker picks it up)
      ├─ pg.query INSERT/UPDATE …    (persist, claim)
      ├─ reply.generate              (custom span: driver, conversation id,
      │                               sid, history turns — the dominant cost)
      ├─ POST …/Messages.json        (Twilio send)
      └─ publish whatup-changes ×N   (SSE change hints)
```

`reply.generate` is the only hand-written span (`messages.service.ts`) —
everything else is free from auto-instrumentation.

### Metrics (Prometheus)

Declared in `src/observability/metrics.ts`, recorded by the pipeline and the
RabbitMQ adapter:

| Metric (Prometheus name) | Type | Labels | Meaning |
|---|---|---|---|
| `whatup_messages_processed_total` | counter | `outcome` = `sent` \| `failed` \| `duplicate` | Every queue delivery's outcome. `duplicate` counts deliveries absorbed by the claim/unique-sid defences — proof the idempotency layer works. |
| `whatup_pipeline_duration_seconds` | histogram | — | Persist → reply sent, end to end. Recorded on success only. |
| `whatup_reply_duration_seconds` | histogram | `driver` | Reply generation alone (fake delay or LLM call). |
| `whatup_queue_depth` | gauge | `queue` | Ready messages in `whatup-inbound`, `.retry`, and `.dlq`, observed at each export over a dedicated channel. |

### Dashboard (provisioned)

`observability/grafana/whatup-overview.json`, mounted into the container and
loaded automatically. Layout is Datadog-style: a top row of stat tiles, then
timeseries, then a trace explorer.

- **Tiles:** messages processed, replies sent, failures, duplicates absorbed,
  and **DLQ depth** — the alarm-worthy number; its background flips red the
  moment anything parks.
- **Timeseries:** throughput by outcome, reply-generation p50/p95, queue
  depths, end-to-end pipeline p50/p95.
- **Traces panel:** recent `whatup-backend` traces straight from Tempo —
  click one to see the span tree above.
- **Palette:** the admin UI's own tokens (`whatup-admin/src/index.css`) —
  brand blue `#2b6bf3` / cyan `#00c9f5` for volume and latency, and the UI's
  semantic `--ok` `#17a34a`, `--warn` `#d97a06`, `--danger` `#e2483d` for
  sent / retry / failed, so dashboard colors match the chat's status pills.

## Design decisions

- **OTel over a vendor SDK** — the instrumentation is vendor-neutral; the
  LGTM container is swappable for Datadog/Honeycomb/etc. by changing the OTLP
  endpoint. Same ports-and-drivers philosophy as the rest of the codebase.
- **Opt-in by env var** — observability must never be the reason dev setup
  fails. The SDK bootstraps only when an endpoint is configured; instruments
  obtained through `@opentelemetry/api` are no-ops otherwise.
- **Queue depths from the app, not a broker exporter** — `checkQueue` on a
  dedicated channel keeps the demo to one extra container; a failed check can
  never break the publish channel. At scale you'd scrape RabbitMQ's own
  `rabbitmq_prometheus` plugin instead.
- **Anonymous-admin Grafana** — demo convenience, clearly not production.

## Troubleshooting

- **Dashboard shows zeros / no traces.** The backend only exports when
  `OTEL_EXPORTER_OTLP_ENDPOINT` was set **at process start** — set it in
  `whatup-backend/.env`, restart `npm run dev`, send a message, wait ~10 s
  (the metric export interval).
- **Login screen instead of anonymous access.** Anonymous auth binds to the
  org **by name** (`Main Org.`). Renaming the org in the Grafana UI breaks it
  and you'll be prompted to sign in. The container is stateless (no volume):
  `docker compose --profile obs up -d --force-recreate lgtm` resets it to the
  documented state. If `admin`/`admin` prompts for a new password, choose
  *Skip* — a changed password is also wiped only by a recreate.
- **No logs in Grafana.** Expected: the backend exports traces and metrics;
  log shipping to Loki is not wired (see production notes). The Loki
  datasource is empty by design for now.

## Production notes

- Add alerting rules: `whatup_queue_depth{queue=~".+\\.dlq"} > 0` and a p95
  latency SLO on `whatup_pipeline_duration_seconds`.
- Ship structured logs to Loki over OTLP so the third pillar joins the same
  Grafana (the container already accepts them).
- Replace anonymous access with real auth; pin the `grafana/otel-lgtm` image
  version; give Tempo/Prometheus persistent volumes and retention policies.
- Head sampling is fine at SMS volumes; introduce tail sampling only if trace
  volume ever becomes a cost concern.
