import pino from 'pino';

const level = process.env.LOG_LEVEL ?? 'info';

const logger = pino({
  level,
  transport: process.env.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard',
      ignore: 'pid,hostname',
      destination: 2,
    },
  } : undefined,
}, pino.destination({ dest: 2, sync: false }));

export type LogContext = {
  requestId?: string;
  operation?: string;
  file?: string;
  duration?: number;
  [key: string]: unknown;
};

export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  debug(msg: string, context?: LogContext): void {
    logger.debug({ ...this.context, ...context }, msg);
  }

  info(msg: string, context?: LogContext): void {
    logger.info({ ...this.context, ...context }, msg);
  }

  warn(msg: string, context?: LogContext): void {
    logger.warn({ ...this.context, ...context }, msg);
  }

  error(msg: string, error?: Error | unknown, context?: LogContext): void {
    const errorContext = error instanceof Error
      ? { error: { message: error.message, stack: error.stack, name: error.name } }
      : { error };
    logger.error({ ...this.context, ...context, ...errorContext }, msg);
  }
}

export const rootLogger = new Logger();
