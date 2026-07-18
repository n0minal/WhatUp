import { ConsoleLogger } from '@nestjs/common';
import { logs, SeverityNumber } from '@opentelemetry/api-logs';

/**
 * Nest logger that also emits every line over the OTel Logs API — console
 * output is unchanged, and when otel.ts started an SDK the same lines ship
 * to Loki via OTLP. Emission happens inside the active context, so a log
 * written during a span carries that trace id: Grafana can jump from a slow
 * trace to exactly the log lines it produced. Without an SDK the emitter is
 * a no-op and this is just ConsoleLogger.
 */
export class OtelLogger extends ConsoleLogger {
  private readonly emitter = logs.getLogger('whatup');

  log(message: unknown, ...rest: unknown[]): void {
    super.log(message, ...(rest as [string]));
    this.emit(SeverityNumber.INFO, 'info', message, rest);
  }

  warn(message: unknown, ...rest: unknown[]): void {
    super.warn(message, ...(rest as [string]));
    this.emit(SeverityNumber.WARN, 'warn', message, rest);
  }

  error(message: unknown, ...rest: unknown[]): void {
    super.error(message, ...(rest as [string]));
    this.emit(SeverityNumber.ERROR, 'error', message, rest);
  }

  debug(message: unknown, ...rest: unknown[]): void {
    super.debug(message, ...(rest as [string]));
    this.emit(SeverityNumber.DEBUG, 'debug', message, rest);
  }

  verbose(message: unknown, ...rest: unknown[]): void {
    super.verbose(message, ...(rest as [string]));
    this.emit(SeverityNumber.TRACE, 'verbose', message, rest);
  }

  /** Nest passes the logger context (e.g. class name) as the last string arg. */
  private emit(
    severityNumber: SeverityNumber,
    severityText: string,
    message: unknown,
    rest: unknown[],
  ): void {
    const last = rest[rest.length - 1];
    this.emitter.emit({
      severityNumber,
      severityText,
      body: typeof message === 'string' ? message : JSON.stringify(message),
      attributes: typeof last === 'string' ? { context: last } : {},
    });
  }
}
