import type { GoogleConnectionRepository as Port } from '../domain/questionPorts.js';
import type { GoogleConnection } from '../domain/questionTypes.js';
import type { Database } from '../lib/db.js';

interface Row {
  user_id: number;
  google_email: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_token_expires_at: string | null;
  scopes: string;
  connected_at: string;
  last_used_at: string;
}

/** GoogleConnectionRepository（data-model.md §1.1 `google_connections`）。 */
export class GoogleConnectionRepository implements Port {
  constructor(private readonly db: Database) {}

  findByUser(userId: number): GoogleConnection | null {
    const row = this.db
      .prepare('SELECT * FROM google_connections WHERE user_id = ?')
      .get(userId) as Row | undefined;
    if (!row) return null;
    return {
      userId: row.user_id,
      googleEmail: row.google_email,
      refreshTokenEnc: row.refresh_token_enc,
      accessTokenEnc: row.access_token_enc,
      accessTokenExpiresAt: row.access_token_expires_at
        ? new Date(row.access_token_expires_at)
        : null,
      scopes: row.scopes,
      connectedAt: new Date(row.connected_at),
      lastUsedAt: new Date(row.last_used_at),
    };
  }

  upsert(c: GoogleConnection): void {
    this.db
      .prepare(
        `INSERT INTO google_connections (user_id, google_email, refresh_token_enc, access_token_enc,
           access_token_expires_at, scopes, connected_at, last_used_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET
           google_email = excluded.google_email,
           refresh_token_enc = excluded.refresh_token_enc,
           access_token_enc = excluded.access_token_enc,
           access_token_expires_at = excluded.access_token_expires_at,
           scopes = excluded.scopes,
           connected_at = excluded.connected_at,
           last_used_at = excluded.last_used_at`,
      )
      .run(
        c.userId,
        c.googleEmail,
        c.refreshTokenEnc,
        c.accessTokenEnc,
        c.accessTokenExpiresAt?.toISOString() ?? null,
        c.scopes,
        c.connectedAt.toISOString(),
        c.lastUsedAt.toISOString(),
      );
  }

  updateAccessToken(userId: number, accessTokenEnc: string, expiresAt: Date, now: Date): void {
    this.db
      .prepare(
        `UPDATE google_connections
         SET access_token_enc = ?, access_token_expires_at = ?, last_used_at = ? WHERE user_id = ?`,
      )
      .run(accessTokenEnc, expiresAt.toISOString(), now.toISOString(), userId);
  }

  delete(userId: number): void {
    this.db.prepare('DELETE FROM google_connections WHERE user_id = ?').run(userId);
  }
}
