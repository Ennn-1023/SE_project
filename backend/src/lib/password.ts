import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * 密碼雜湊（research.md R4；儲存格式對應 data-model.md User.passwordHash）。
 * 格式：scrypt$N$r$p$<salt base64>$<hash base64>
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function deriveKey(password: string, salt: Buffer, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, { N, r: R, p: P });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltText, hashText] = parts as [string, string, string, string, string, string];
  const expected = Buffer.from(hashText, "base64");
  const key = await deriveKey(password, Buffer.from(saltText, "base64"), {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/**
 * 帳號不存在時用來比對的假雜湊，讓「帳號不存在」與「密碼錯誤」的處理工作量相同
 * （research.md R6、spec FR-009）。啟動後第一次使用時才產生。
 */
let dummyHashPromise: Promise<string> | undefined;
export function getDummyHash(): Promise<string> {
  dummyHashPromise ??= hashPassword(randomBytes(32).toString("base64"));
  return dummyHashPromise;
}

/**
 * 供 service 呼叫的物件形式（測試可用 vi.spyOn 監看比對次數，見 tasks.md T034）。
 */
export const passwords = { hashPassword, verifyPassword };
