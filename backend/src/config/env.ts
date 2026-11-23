import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { fieldError } from '../middleware/validate.js';

/** 後端套件根目錄（backend/）。 */
export const BACKEND_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

/** Config（類別圖 001-class、research R10）。 */
export interface Config {
  studentDefaultPassword: string;
  teacherAccount: string;
  teacherInitialPassword: string;
  sessionSecret: string;
  /** 閒置逾時（毫秒） */
  sessionIdleTimeout: number;
  databasePath: string;
  port: number;
  nodeEnv: 'development' | 'test' | 'production';
}

/** 設定缺漏或格式錯誤。訊息只列變數名稱與規則，不含任何設定值（FR-001）。 */
export class ConfigError extends Error {
  readonly variables: string[];
  constructor(problems: { name: string; rule: string }[]) {
    super(
      '環境變數設定錯誤，系統無法啟動：\n' +
        problems.map((p) => `  - ${p.name}：${p.rule}`).join('\n') +
        '\n請參考 .env.template 補齊 .env。',
    );
    this.name = 'ConfigError';
    this.variables = problems.map((p) => p.name);
  }
}

/** 空字串視為未設定，讓 .env.template 中留空的選填變數使用預設值。 */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), schema);

const intString = (min: number, max: number) =>
  z
    .string()
    .regex(/^\d+$/, `須為 ${min}–${max} 的整數`)
    .transform(Number)
    .refine((n) => n >= min && n <= max, `須為 ${min}–${max} 的整數`);

const envSchema = z.object({
  STUDENT_DEFAULT_PASSWORD: optional(
    z
      .string(fieldError('必填', '須為文字'))
      .min(4, '長度須為 4–64 字元')
      .max(64, '長度須為 4–64 字元'),
  ),
  TEACHER_INITIAL_PASSWORD: optional(
    z
      .string(fieldError('必填', '須為文字'))
      .min(8, '長度須為 8–64 字元')
      .max(64, '長度須為 8–64 字元'),
  ),
  SESSION_SECRET: optional(z.string(fieldError('必填', '須為文字')).min(32, '長度須至少 32 字元')),
  TEACHER_ACCOUNT: optional(
    z
      .string()
      .regex(/^[A-Za-z0-9]{4,20}$/, '須為 4–20 個英文字母或數字')
      .default('teacher'),
  ),
  DATABASE_PATH: optional(z.string().default('./data/app.db')),
  PORT: optional(intString(1, 65535).default(3000)),
  SESSION_IDLE_MINUTES: optional(intString(5, 1440).default(120)),
  NODE_ENV: optional(
    z
      .enum(['development', 'test', 'production'], {
        error: '須為 development、test 或 production',
      })
      .default('development'),
  ),
});

function load(env: Record<string, string | undefined>): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => ({
      name: String(issue.path[0]),
      rule: issue.message,
    }));
    throw new ConfigError(problems);
  }
  const e = parsed.data;
  const databasePath =
    e.DATABASE_PATH === ':memory:' ? ':memory:' : path.resolve(BACKEND_ROOT, e.DATABASE_PATH);
  return {
    studentDefaultPassword: e.STUDENT_DEFAULT_PASSWORD,
    teacherAccount: e.TEACHER_ACCOUNT,
    teacherInitialPassword: e.TEACHER_INITIAL_PASSWORD,
    sessionSecret: e.SESSION_SECRET,
    sessionIdleTimeout: e.SESSION_IDLE_MINUTES * 60_000,
    databasePath,
    port: e.PORT,
    nodeEnv: e.NODE_ENV,
  };
}

/** 開發時從專案根目錄的 .env 載入環境變數（不覆蓋已存在的變數）。 */
function loadDotenv(): void {
  dotenv.config({ path: path.join(REPO_ROOT, '.env'), quiet: true });
}

export const Config = { load, loadDotenv };
