import type { Database } from '../lib/db.js';
import type { GroupSettingsRepository as GroupSettingsRepositoryPort } from '../domain/ports.js';
import type { GroupSettings } from '../domain/types.js';

/** GroupSettingsRepository（data-model.md `group_settings`，單列 id = 1）。 */
export class GroupSettingsRepository implements GroupSettingsRepositoryPort {
  constructor(private readonly db: Database) {}

  get(): GroupSettings {
    const row = this.db.prepare('SELECT group_count FROM group_settings WHERE id = 1').get() as
      { group_count: number } | undefined;
    return { groupCount: row?.group_count ?? 0 };
  }

  setGroupCount(n: number, at: Date): void {
    this.db
      .prepare('UPDATE group_settings SET group_count = ?, updated_at = ? WHERE id = 1')
      .run(n, at.toISOString());
  }
}
