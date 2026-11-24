import { describe, expect, it } from 'vitest';
import { Config, ConfigError } from '../../src/config/env.js';

const valid = {
  STUDENT_DEFAULT_PASSWORD: 'fake-pw-a',
  TEACHER_INITIAL_PASSWORD: 'fake-teacher-b',
  SESSION_SECRET: 'x'.repeat(40),
};

function loadError(env: Record<string, string | undefined>): ConfigError {
  try {
    Config.load(env);
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error('expected ConfigError');
}

describe('Config.load', () => {
  it('完整設定成功載入並套用預設值（正常）', () => {
    const c = Config.load(valid);
    expect(c.studentDefaultPassword).toBe('fake-pw-a');
    expect(c.teacherAccount).toBe('teacher');
    expect(c.port).toBe(3000);
    expect(c.sessionIdleTimeout).toBe(120 * 60_000);
    expect(c.nodeEnv).toBe('development');
    expect(c.databasePath).toMatch(/data[\\/]app\.db$/);
  });

  it('選填變數留空字串時使用預設值', () => {
    const c = Config.load({ ...valid, PORT: '', TEACHER_ACCOUNT: '  ', SESSION_IDLE_MINUTES: '' });
    expect(c.port).toBe(3000);
    expect(c.teacherAccount).toBe('teacher');
  });

  it('缺少 SESSION_SECRET 時錯誤只列變數名稱、不含任何值（邊界）', () => {
    const err = loadError({ ...valid, SESSION_SECRET: undefined });
    expect(err.variables).toEqual(['SESSION_SECRET']);
    expect(err.message).toContain('SESSION_SECRET');
    expect(err.message).not.toContain(valid.STUDENT_DEFAULT_PASSWORD);
    expect(err.message).not.toContain(valid.TEACHER_INITIAL_PASSWORD);
  });

  it('SESSION_SECRET 少於 32 字元時拒絕，訊息不含該值（邊界）', () => {
    const short = 'short-secret-value-123';
    const err = loadError({ ...valid, SESSION_SECRET: short });
    expect(err.variables).toEqual(['SESSION_SECRET']);
    expect(err.message).not.toContain(short);
  });

  it('PORT 非數字時拒絕，訊息不含該值（邊界）', () => {
    const err = loadError({ ...valid, PORT: 'abc' });
    expect(err.variables).toContain('PORT');
    expect(err.message).not.toContain('abc');
  });

  it('同時缺多個必填變數時全部列出', () => {
    const err = loadError({});
    expect(err.variables.sort()).toEqual(
      ['SESSION_SECRET', 'STUDENT_DEFAULT_PASSWORD', 'TEACHER_INITIAL_PASSWORD'].sort(),
    );
  });

  it('SESSION_IDLE_MINUTES 超出 5–1440 時拒絕', () => {
    expect(loadError({ ...valid, SESSION_IDLE_MINUTES: '4' }).variables).toEqual([
      'SESSION_IDLE_MINUTES',
    ]);
    expect(Config.load({ ...valid, SESSION_IDLE_MINUTES: '1440' }).sessionIdleTimeout).toBe(
      1440 * 60_000,
    );
  });
});
