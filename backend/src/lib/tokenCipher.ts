import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * TokenCipher（組件圖 003-component、research R1）：以 AES-256-GCM 加密保存 Google token。
 * 密文格式 `iv.tag.ciphertext`（皆為 base64），見 data-model.md §1.1 google_connections.refresh_token_enc。
 */
export class TokenCipher {
  private readonly key: Buffer;

  constructor(key: Buffer) {
    if (key.length !== 32) throw new Error('TokenCipher 金鑰須為 32 bytes');
    this.key = key;
  }

  encrypt(plain: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [iv, tag, data].map((b) => b.toString('base64')).join('.');
  }

  decrypt(cipherText: string): string {
    const parts = cipherText.split('.');
    if (parts.length !== 3) throw new Error('密文格式不正確');
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, 'base64')) as [Buffer, Buffer, Buffer];
    if (iv.length !== 12 || tag.length !== 16) throw new Error('密文格式不正確');
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  }
}
