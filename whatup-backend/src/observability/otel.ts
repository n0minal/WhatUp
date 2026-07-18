import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { NodeSDK } from '@opentelemetry/sdk-node';

/**
 * OpenTelemetry bootstrap — imported first in main.ts so the auto
 * instrumentations can patch http/express/pg/amqplib before anything
 * requires them. The amqplib instrumentation propagates trace context
 * through message headers, so one trace spans API → RabbitMQ → worker.
 *
 * Opt-in: without OTEL_EXPORTER_OTLP_ENDPOINT this module is a no-op and
 * the app runs exactly as before (metrics/spans hit the API's no-op
 * implementations). Dev target: the grafana/otel-lgtm container
 * (docker compose --profile obs up), OTLP over HTTP on :4318.
 */
if (process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
  const sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? 'whatup-backend',
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 10_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        // fs instrumentation is pure noise for a network service.
        '@opentelemetry/instrumentation-fs': { enabled: false },
      }),
    ],
  });
  sdk.start();
  process.on('SIGTERM', () => void sdk.shutdown());
}
