import { beforeEach, describe, expect, it } from 'vitest';
import { migrate } from '../../src/db/migrations.js';
import { SessionRepository } from '../../src/db/sessionRepository.js';
import { UserRepository } from '../../src/db/userRepository.js';
import { createFakeClock, type FakeClock } from '../../src/lib/clock.js';
import { openDatabase, type Database } from '../../src/lib/db.js';
import { AppError } from '../../src/lib/errors.js';
import { SessionService } from '../../src/services/sessionService.js';

const IDLE = 120 * 60_000;

describe('SessionService', () => {
  let db: Database;
  let clock: FakeClock;
  let service: SessionService;
  let userId: number;

  beforeEach(() => {
    clock = createFakeClock();
    db = openDatabase(':memory:');
    migrate(db, clock.now());
    userId = new UserRepository(db, () => clock.now()).createStudent('S0001', '甲', 'scrypt$x').id;
    service = new SessionService(
      new SessionRepository(db),
      { sessionSecret: 'fake-secret-'.padEnd(40, 'z'), sessionIdleTimeout: IDLE },
      clock,
    );
  });

  const expectUnauthenticated = (fn: () => unknown) => {
    try {
      fn();
    } catch (err) {
      expect(err).toBeInstanceOf(AppError);
      expect((err as AppError).code).toBe('UNAUTHENTICATED');
      return;
    }
    throw new Error('expected UNAUTHENTICATED');
  };

  it('建立後可驗證（正常）', () => {
    const { token, session } = service.create(userId);
    expect(service.validate(token).id).toBe(session.id);
  });

  it('資料庫中的 sessions.id 不等於原始 token', () => {
    const { token } = service.create(userId);
    const rows = db.prepare('SELECT id FROM sessions').all() as { id: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe(token);
    expect(rows[0]!.id).toMatch(/^[0-9a-f]{64}$/);
  });

  it('撤銷後回 UNAUTHENTICATED（邊界）', () => {
    const { token } = service.create(userId);
    service.revoke(token);
    expectUnauthenticated(() => service.validate(token));
  });

  it('閒置剛好等於逾時回 UNAUTHENTICATED；少 1 秒仍有效（邊界）', () => {
    const { token } = service.create(userId);
    clock.advance(IDLE - 1000);
    expect(() => service.validate(token)).not.toThrow();
    clock.advance(1000);
    expectUnauthenticated(() => service.validate(token));
  });

  it('touch 會延長有效期', () => {
    const { token } = service.create(userId);
    clock.advance(IDLE - 1000);
    service.touch(token);
    clock.advance(IDLE - 1000);
    expect(() => service.validate(token)).not.toThrow();
    clock.advance(IDLE + 1);
    expectUnauthenticated(() => service.validate(token));
  });

  it('偽造或空白 token 回 UNAUTHENTICATED（邊界）', () => {
    service.create(userId);
    expectUnauthenticated(() => service.validate('forged-token'));
    expectUnauthenticated(() => service.validate(''));
  });

  it('revokeAllForUser 撤銷該使用者全部 session', () => {
    const a = service.create(userId);
    const b = service.create(userId);
    service.revokeAllForUser(userId);
    expectUnauthenticated(() => service.validate(a.token));
    expectUnauthenticated(() => service.validate(b.token));
  });
});
