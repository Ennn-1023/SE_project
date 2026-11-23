import { describe, expect, it } from 'vitest';
import { Config, ConfigError } from '../../src/config/env';

/** 002 搶答新增的設定（CLIENT_ORIGIN、ENABLE_DEV_TOOLS）；001 的設定規則見 config.test.ts。值皆為虛構。 */
const BASE = {
  STUDENT_DEFAULT_PASSWORD: 'fake-default-pw',
  TEACHER_INITIAL_PASSWORD: 'fake-teacher-pw-01',
  SESSION_SECRET: 'x'.repeat(40),
};

describe('Config.load：搶答相關設定', () => {
  it('合法設定時套用預設值', () => {
    expect(Config.load(BASE)).toMatchObject({
      port: 3000,
      clientOrigin: 'http://localhost:5173',
      enableDevTools: false,
      nodeEnv: 'development',
    });
  });

  it('SESSION_SECRET 少於 32 字元被拒，且訊息不含變數的值', () => {
    const short = 'my-secret-value-123';
    try {
      Config.load({ ...BASE, SESSION_SECRET: short });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError);
      const msg = (e as ConfigError).message;
      expect(msg).toContain('SESSION_SECRET');
      expect(msg).not.toContain(short);
    }
  });

  it('production 搭配 ENABLE_DEV_TOOLS=true 時拒絕啟動', () => {
    expect(() =>
      Config.load({ ...BASE, NODE_ENV: 'production', ENABLE_DEV_TOOLS: 'true' }),
    ).toThrowError(/ENABLE_DEV_TOOLS/);
  });

  it('PORT 不是合法數字時被拒；0 表示隨機連接埠', () => {
    expect(() => Config.load({ ...BASE, PORT: 'abc' })).toThrowError(/PORT/);
    expect(Config.load({ ...BASE, PORT: '0' }).port).toBe(0);
  });

  it('ENABLE_DEV_TOOLS 只接受 true／false', () => {
    expect(Config.load({ ...BASE, ENABLE_DEV_TOOLS: 'true' }).enableDevTools).toBe(true);
    expect(() => Config.load({ ...BASE, ENABLE_DEV_TOOLS: 'yes' })).toThrowError(
      /ENABLE_DEV_TOOLS/,
    );
  });

  it('CLIENT_ORIGIN 可自訂', () => {
    expect(Config.load({ ...BASE, CLIENT_ORIGIN: 'http://example.test' }).clientOrigin).toBe(
      'http://example.test',
    );
  });
});
