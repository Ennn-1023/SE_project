import { describe, expect, it } from 'vitest';
import { TokenCipher } from '../../src/lib/tokenCipher.js';

const key = Buffer.alloc(32, 3);

describe('TokenCipher（AES-256-GCM，research R1）', () => {
  it('加解密往返（正常）', () => {
    const c = new TokenCipher(key);
    const enc = c.encrypt('fake-refresh-token-abc');
    expect(enc).not.toContain('fake-refresh-token-abc');
    expect(enc.split('.')).toHaveLength(3);
    expect(c.decrypt(enc)).toBe('fake-refresh-token-abc');
  });

  it('同一明文兩次加密結果不同（隨機 IV）', () => {
    const c = new TokenCipher(key);
    expect(c.encrypt('same')).not.toBe(c.encrypt('same'));
  });

  it('竄改密文或 tag 時解密失敗（邊界）', () => {
    const c = new TokenCipher(key);
    const [iv, tag, data] = c.encrypt('secret-value').split('.') as [string, string, string];
    const flip = (b64: string) => {
      const buf = Buffer.from(b64, 'base64');
      buf[0] = buf[0]! ^ 0xff;
      return buf.toString('base64');
    };
    expect(() => c.decrypt([iv, tag, flip(data)].join('.'))).toThrow();
    expect(() => c.decrypt([iv, flip(tag), data].join('.'))).toThrow();
    expect(() => c.decrypt('not-a-cipher')).toThrow();
  });

  it('錯誤金鑰無法解密（邊界）', () => {
    const enc = new TokenCipher(key).encrypt('secret-value');
    expect(() => new TokenCipher(Buffer.alloc(32, 9)).decrypt(enc)).toThrow();
  });

  it('金鑰不是 32 bytes 時拒絕建立', () => {
    expect(() => new TokenCipher(Buffer.alloc(16))).toThrow();
  });
});
