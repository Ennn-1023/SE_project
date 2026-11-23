import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { PasswordHasher as PasswordHasherPort } from '../domain/ports.js';

/** research R6：N=16384, r=8, p=1，16 bytes salt，64 bytes 輸出。 */
export const DEFAULT_SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

/**
 * 帳號不存在時用來比對的固定假雜湊（FR-018：讓回應時間與密碼錯誤相近）。
 * 它對應一組隨機、未記錄的密碼，不是機敏資料。
 */
export const DUMMY_PASSWORD_HASH =
  'scrypt$16384$8$1$ah+ptdVp/R4J5AaN9lA56g==$KKKgiCN1Yp+zAzTskdL9iN99aNe4kR5xtUbVQ8NshpUIqw/lfUeu+GFPxvUtvtthe49D1f4XAKPV8E+i94Ikyw==';

function scrypt(
  plain: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(plain, salt, keyLength, { ...options, maxmem: 256 * 1024 * 1024 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** PasswordHasher（類別圖 <<scrypt>>）：非同步 scrypt，於 libuv 執行緒池計算。 */
export class PasswordHasher implements PasswordHasherPort {
  constructor(
    private readonly params: { N: number; r: number; p: number } = DEFAULT_SCRYPT_PARAMS,
  ) {}

  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_LENGTH);
    const { N, r, p } = this.params;
    const key = await scrypt(plain, salt, KEY_LENGTH, { N, r, p });
    return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
  }

  async verify(plain: string, stored: string): Promise<boolean> {
    const parts = stored.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [, n, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, 'base64');
    const actual = await scrypt(plain, Buffer.from(saltB64, 'base64'), expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }
}
