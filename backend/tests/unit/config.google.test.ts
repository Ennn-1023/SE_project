import { describe, expect, it } from 'vitest';
import { Config, ConfigError } from '../../src/config/env.js';

const base = {
  STUDENT_DEFAULT_PASSWORD: 'fake-pw-a',
  TEACHER_INITIAL_PASSWORD: 'fake-teacher-b',
  SESSION_SECRET: 'x'.repeat(40),
};

/** 虛構的測試值，不是任何真實憑證。 */
const FAKE_ID = 'fake-client-123.apps.googleusercontent.com';
const FAKE_SECRET = 'fake-client-secret-value';
const FAKE_KEY = Buffer.alloc(32, 7).toString('base64');

const google = {
  GOOGLE_CLIENT_ID: FAKE_ID,
  GOOGLE_CLIENT_SECRET: FAKE_SECRET,
  GOOGLE_TOKEN_ENCRYPTION_KEY: FAKE_KEY,
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

describe('Config.google（research R10）', () => {
  it('三個 GOOGLE_* 全空時 google = null，系統仍可啟動（正常）', () => {
    expect(Config.load(base).google).toBeNull();
    expect(
      Config.load({
        ...base,
        GOOGLE_CLIENT_ID: '',
        GOOGLE_CLIENT_SECRET: ' ',
        GOOGLE_TOKEN_ENCRYPTION_KEY: '',
      }).google,
    ).toBeNull();
  });

  it('全部填寫時載入，redirectUri 預設為 CLIENT_ORIGIN 的回呼路徑（正常）', () => {
    const c = Config.load({ ...base, ...google });
    expect(c.google).not.toBeNull();
    expect(c.google!.clientId).toBe(FAKE_ID);
    expect(c.google!.clientSecret).toBe(FAKE_SECRET);
    expect(c.google!.encryptionKey.length).toBe(32);
    expect(c.google!.redirectUri).toBe('http://localhost:5173/api/google/oauth/callback');
  });

  it('可覆寫 GOOGLE_OAUTH_REDIRECT_URI', () => {
    const c = Config.load({
      ...base,
      ...google,
      GOOGLE_OAUTH_REDIRECT_URI: 'https://quiz.example.edu/api/google/oauth/callback',
    });
    expect(c.google!.redirectUri).toBe('https://quiz.example.edu/api/google/oauth/callback');
  });

  it.each([
    ['只填 CLIENT_ID', { GOOGLE_CLIENT_ID: FAKE_ID }],
    ['缺 ENCRYPTION_KEY', { GOOGLE_CLIENT_ID: FAKE_ID, GOOGLE_CLIENT_SECRET: FAKE_SECRET }],
    [
      '只填 SECRET 與 KEY',
      { GOOGLE_CLIENT_SECRET: FAKE_SECRET, GOOGLE_TOKEN_ENCRYPTION_KEY: FAKE_KEY },
    ],
  ])('只填部分（%s）→ ConfigError 只列變數名稱、不含值（邊界）', (_label, partial) => {
    const err = loadError({ ...base, ...partial });
    expect(err.variables.every((v) => v.startsWith('GOOGLE_'))).toBe(true);
    expect(err.variables.length).toBeGreaterThan(0);
    expect(err.message).not.toContain(FAKE_SECRET);
    expect(err.message).not.toContain(FAKE_KEY);
  });

  it('金鑰不是 base64 → ConfigError（邊界）', () => {
    const err = loadError({ ...base, ...google, GOOGLE_TOKEN_ENCRYPTION_KEY: '不是base64!!' });
    expect(err.variables).toEqual(['GOOGLE_TOKEN_ENCRYPTION_KEY']);
  });

  it('金鑰解碼後不是 32 bytes → ConfigError（邊界）', () => {
    const shortKey = Buffer.alloc(16, 1).toString('base64');
    const err = loadError({ ...base, ...google, GOOGLE_TOKEN_ENCRYPTION_KEY: shortKey });
    expect(err.variables).toEqual(['GOOGLE_TOKEN_ENCRYPTION_KEY']);
    expect(err.message).not.toContain(shortKey);
  });

  it('CLIENT_ID 格式錯誤 → ConfigError（邊界）', () => {
    const err = loadError({ ...base, ...google, GOOGLE_CLIENT_ID: 'not-a-google-client' });
    expect(err.variables).toEqual(['GOOGLE_CLIENT_ID']);
  });

  it('REDIRECT_URI 不是 http(s) → ConfigError（邊界）', () => {
    const err = loadError({ ...base, ...google, GOOGLE_OAUTH_REDIRECT_URI: 'ftp://x/cb' });
    expect(err.variables).toEqual(['GOOGLE_OAUTH_REDIRECT_URI']);
  });
});
