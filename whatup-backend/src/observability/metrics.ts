import { metrics } from '@opentelemetry/api';

/**
 * WhatUp's custom instruments, on top of what auto-instrumentation already
 * captures (HTTP, pg, amqplib). Obtained through the OTel API so they are
 * no-ops unless otel.ts started an SDK.
 *
 * Prometheus-side names (OTLP translation appends unit/suffix):
 *   whatup.messages.processed  -> whatup_messages_processed_total{outcome}
 *   whatup.pipeline.duration   -> whatup_pipeline_duration_seconds_bucket
 *   whatup.reply.duration      -> whatup_reply_duration_seconds_bucket
 *   whatup.queue.depth         -> whatup_queue_depth{queue}
 */
const meter = metrics.getMeter('whatup');

/** Outcome of each queue delivery: sent | failed | duplicate. */
export const messagesProcessed = meter.createCounter(
  'whatup.messages.processed',
  {
    description:
      'Queue deliveries processed by the worker pipeline, by outcome',
  },
);

/** Webhook-persisted to reply-sent, seconds. Recorded on success only. */
export const pipelineDuration = meter.createHistogram(
  'whatup.pipeline.duration',
  {
    unit: 's',
    description: 'End-to-end pipeline latency: persist to reply sent',
  },
);

/** Reply generation alone (fake delay or LLM call), seconds. */
export const replyDuration = meter.createHistogram('whatup.reply.duration', {
  unit: 's',
  description: 'ReplyGenerator latency, by driver',
});

/** Depth of the work queues; observed by RabbitMqService. */
export const queueDepth = meter.createObservableGauge('whatup.queue.depth', {
  description: 'Messages ready in each RabbitMQ queue',
});
