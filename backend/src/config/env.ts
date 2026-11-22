import { z } from 'zod';

/** 環境變數驗證（research.md R11、憲章原則 III）。錯誤訊息只列變數名稱，不含值。 */
const schema = z.object({
  SESSION_SECRET: z
    .string({ error: '缺少必要環境變數' })
    .min(32, { error: '長度必須至少 32 字元' }),
  PORT: z.coerce
    .number({ error: '必須是數字' })
    .int({ error: '必須是整數' })
    .min(0, { error: '必須介於 0–65535（0 表示隨機）' })
    .max(65535, { error: '必須介於 0–65535（0 表示隨機）' })
    .default(3000),
  SQLITE_PATH: z.string().min(1).default('./data/buzzer.db'),
  CLIENT_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  ENABLE_DEV_TOOLS: z
    .enum(['true', 'false'], { error: '只能是 true 或 false' })
    .default('false'),
  NODE_ENV: z
    .enum(['development', 'test', 'production'], { error: '只能是 development、test 或 production' })
    .default('development'),
});

export interface Config {
  sessionSecret: string;
  port: number;
  sqlitePath: string;
  clientOrigin: string;
  enableDevTools: boolean;
  nodeEnv: 'development' | 'test' | 'production';
}

export class EnvError extends Error {
  constructor(public readonly problems: string[]) {
    super(`環境變數設定錯誤：\n${problems.map((p) => `  - ${p}`).join('\n')}\n請參考 .env.template 設定 .env。`);
    this.name = 'EnvError';
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  // 空字串視為未設定
  const cleaned = Object.fromEntries(
    Object.entries(env).filter(([, v]) => v !== undefined && v !== ''),
  );
  const parsed = schema.safeParse(cleaned);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => {
      const name = String(i.path[0] ?? '環境變數');
      const reason = i.code === 'invalid_type' && i.input === undefined ? '缺少必要環境變數' : i.message;
      return `${name}：${reason}`;
    });
    throw new EnvError(problems);
  }
  const d = parsed.data;
  if (d.NODE_ENV === 'production' && d.ENABLE_DEV_TOOLS === 'true') {
    throw new EnvError(['ENABLE_DEV_TOOLS：production 環境不得啟用開發工具']);
  }
  return {
    sessionSecret: d.SESSION_SECRET,
    port: d.PORT,
    sqlitePath: d.SQLITE_PATH,
    clientOrigin: d.CLIENT_ORIGIN,
    enableDevTools: d.ENABLE_DEV_TOOLS === 'true',
    nodeEnv: d.NODE_ENV,
  };
}
