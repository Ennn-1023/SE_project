import type { Database } from '../lib/db.js';
import type { SessionRepository as SessionRepositoryPort } from '../domain/ports.js';
import type { Session } from '../domain/types.js';

interface SessionRow {
  id: string;
  user_id: number;
  created_at: string;
  last_active_at: string;
  revoked_at: string | null;
}

/** SessionRepository（data-model.md `sessions`）。 */
export class SessionRepository implements SessionRepositoryPort {
  constructor(private readonly db: Database) {}

  create(session: Session): void {
    this.db
      .prepare(
        'INSERT INTO sessions (id, user_id, created_at, last_active_at, revoked_at) VALUES (?, ?, ?, ?, NULL)',
      )
      .run(
        session.id,
        session.userId,
        session.createdAt.toISOString(),
        session.lastActiveAt.toISOString(),
      );
  }

  findById(id: string): Session | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as
      SessionRow | undefined;
    if (!row) return null;
    return {
      id: row.id,
      userId: row.user_id,
      createdAt: new Date(row.created_at),
      lastActiveAt: new Date(row.last_active_at),
      revoked: row.revoked_at !== null,
    };
  }

  updateLastActive(id: string, at: Date): void {
    this.db
      .prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?')
      .run(at.toISOString(), id);
  }

  revoke(id: string, at: Date): void {
    this.db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL')
      .run(at.toISOString(), id);
  }

  revokeAllForUser(userId: number, at: Date): void {
    this.db
      .prepare('UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
      .run(at.toISOString(), userId);
  }
}
