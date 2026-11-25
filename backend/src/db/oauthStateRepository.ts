import type { OAuthStateRepository as Port } from '../domain/questionPorts.js';
import type { OAuthState } from '../domain/questionTypes.js';
import type { Database } from '../lib/db.js';

interface Row {
  state: string;
  user_id: number;
  session_id: string;
  code_verifier_enc: string;
  created_at: string;
  expires_at: string;
}

/** OAuthStateRepository（data-model.md §1.2 `oauth_states`）：state 只能使用一次。 */
export class OAuthStateRepository implements Port {
  constructor(private readonly db: Database) {}

  create(s: OAuthState): void {
    this.db
      .prepare(
        `INSERT INTO oauth_states (state, user_id, session_id, code_verifier_enc, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        s.state,
        s.userId,
        s.sessionId,
        s.codeVerifierEnc,
        s.createdAt.toISOString(),
        s.expiresAt.toISOString(),
      );
  }

  /** 取出並刪除（單次使用）。 */
  take(state: string): OAuthState | null {
    const row = this.db.prepare('SELECT * FROM oauth_states WHERE state = ?').get(state) as
      Row | undefined;
    if (!row) return null;
    this.db.prepare('DELETE FROM oauth_states WHERE state = ?').run(state);
    return {
      state: row.state,
      userId: row.user_id,
      sessionId: row.session_id,
      codeVerifierEnc: row.code_verifier_enc,
      createdAt: new Date(row.created_at),
      expiresAt: new Date(row.expires_at),
    };
  }

  deleteExpired(now: Date): void {
    this.db.prepare('DELETE FROM oauth_states WHERE expires_at <= ?').run(now.toISOString());
  }
}
