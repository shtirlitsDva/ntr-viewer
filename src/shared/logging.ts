export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogPayload {
  readonly level: LogLevel;
  readonly message: string;
  readonly context?: Record<string, unknown>;
}

type LogSink = (payload: LogPayload) => void;

/**
 * Minimal structured logger that can fan out to multiple sinks.
 * Defaults to console output (warn/error only in production) to respect lint rules.
 */
export class Logger {
  private sinks: Set<LogSink> = new Set();

  constructor(private readonly options: { readonly label: string }) {}

  addSink(sink: LogSink): void {
    this.sinks.add(sink);
  }

  removeSink(sink: LogSink): void {
    this.sinks.delete(sink);
  }

  debug(message: string, context?: Record<string, unknown>): void {
    this.emit("debug", message, context);
  }

  info(message: string, context?: Record<string, unknown>): void {
    this.emit("info", message, context);
  }

  warn(message: string, context?: Record<string, unknown>): void {
    this.emit("warn", message, context);
  }

  error(message: string, context?: Record<string, unknown>): void {
    this.emit("error", message, context);
  }

  private emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
    const payload: LogPayload = {
      level,
      message: `[${this.options.label}] ${message}`,
      context,
    };

    if (level === "warn") {
      console.warn(payload.message, context);
    } else if (level === "error") {
      console.error(payload.message, context);
    } else if (level === "info" && import.meta.env.DEV) {
      console.info(payload.message, context);
    } else if (level === "debug" && import.meta.env.DEV) {
      console.debug(payload.message, context);
    }

    for (const sink of this.sinks) {
      sink(payload);
    }
  }
}

export const createLogger = (label: string): Logger => new Logger({ label });
