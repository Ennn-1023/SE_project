import pino, { type DestinationStream, type Logger } from "pino";

/**
 * 應用程式 log（research.md R10、憲章原則 III）：遮罩所有可能含機敏資料的欄位。
 */
export const REDACT_PATHS = [
  "password",
  "currentPassword",
  "newPassword",
  "confirmPassword",
  "passwordHash",
  "token",
  "cookie",
  "authorization",
  "*.password",
  "*.currentPassword",
  "*.newPassword",
  "*.confirmPassword",
  "*.passwordHash",
  "*.token",
  "*.cookie",
  "*.authorization",
  "req.headers.cookie",
  "req.headers.authorization",
];

export function createLogger(options: { level?: string; destination?: DestinationStream } = {}): Logger {
  return pino(
    {
      level: options.level ?? "info",
      redact: { paths: REDACT_PATHS, censor: "[已遮罩]" },
    },
    options.destination,
  );
}

export type { Logger };
