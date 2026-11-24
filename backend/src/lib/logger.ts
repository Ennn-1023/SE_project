/** Logger（組件圖：遮罩機敏欄位；research R11）。輸出 JSON 行，寫入前遞迴遮罩機敏鍵名。 */
export type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

export const SENSITIVE_KEY = /password|secret|token|hash|cookie|authorization/i;
export const MASK = '[REDACTED]';

export function maskSensitive(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => maskSensitive(v, seen));
  if (value instanceof Error) {
    return { name: value.name, message: value.message };
  }
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value)) {
    out[key] = SENSITIVE_KEY.test(key) ? MASK : maskSensitive(v, seen);
  }
  return out;
}

export interface LoggerOptions {
  /** 輸出目標；預設為 stdout／stderr。 */
  sink?: (line: string, level: LogLevel) => void;
  /** 是否靜音；預設在 NODE_ENV=test 時靜音。 */
  silent?: boolean;
  clock?: () => Date;
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const silent = options.silent ?? (options.sink === undefined && process.env.NODE_ENV === 'test');
  const sink =
    options.sink ??
    ((line: string, level: LogLevel) =>
      level === 'error' ? process.stderr.write(line + '\n') : process.stdout.write(line + '\n'));
  const now = options.clock ?? (() => new Date());

  const write = (level: LogLevel, message: string, data?: Record<string, unknown>) => {
    if (silent) return;
    const entry = {
      time: now().toISOString(),
      level,
      message,
      ...(data ? (maskSensitive(data) as object) : {}),
    };
    sink(JSON.stringify(entry), level);
  };

  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}
