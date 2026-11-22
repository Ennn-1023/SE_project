import { describe, expect, it } from 'vitest';
import { EnvError, loadConfig } from '../../src/config/env';

const SECRET = 'x'.repeat(40);

describe('loadConfig', () => {
  it('合法設定時套用預設值', () => {
    const c = loadConfig({ SESSION_SECRET: SECRET });
    expect(c).toMatchObject({
      sessionSecret: SECRET,
      port: 3000,
      sqlitePath: './data/buzzer.db',
      clientOrigin: 'http://localhost:5173',
      enableDevTools: false,
      nodeEnv: 'development',
    });
  });

  it('缺少 SESSION_SECRET 時指出變數名稱', () => {
    expect(() => loadConfig({})).toThrowError(EnvError);
    try {
      loadConfig({});
    } catch (e) {
      expect((e as EnvError).message).toContain('SESSION_SECRET');
    }
  });

  it('SESSION_SECRET 少於 32 字元被拒，且訊息不含變數的值', () => {
    const short = 'my-secret-value-123';
    try {
      loadConfig({ SESSION_SECRET: short });
      expect.unreachable();
    } catch (e) {
      const msg = (e as EnvError).message;
      expect(msg).toContain('SESSION_SECRET');
      expect(msg).not.toContain(short);
    }
  });

  it('production 搭配 ENABLE_DEV_TOOLS=true 時拒絕啟動', () => {
    expect(() =>
      loadConfig({ SESSION_SECRET: SECRET, NODE_ENV: 'production', ENABLE_DEV_TOOLS: 'true' }),
    ).toThrowError(/ENABLE_DEV_TOOLS/);
  });

  it('PORT 不是合法數字時被拒', () => {
    expect(() => loadConfig({ SESSION_SECRET: SECRET, PORT: 'abc' })).toThrowError(/PORT/);
  });

  it('ENABLE_DEV_TOOLS 只接受 true／false', () => {
    expect(loadConfig({ SESSION_SECRET: SECRET, ENABLE_DEV_TOOLS: 'true' }).enableDevTools).toBe(true);
    expect(() => loadConfig({ SESSION_SECRET: SECRET, ENABLE_DEV_TOOLS: 'yes' })).toThrowError(
      /ENABLE_DEV_TOOLS/,
    );
  });
});
