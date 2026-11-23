import { describe, expect, it } from 'vitest';
import { createLogger, MASK } from '../../src/lib/logger.js';

function capture() {
  const lines: string[] = [];
  const logger = createLogger({ sink: (line) => lines.push(line), clock: () => new Date(0) });
  return { logger, lines };
}

describe('Logger', () => {
  it('一般欄位正常輸出為 JSON 行（正常）', () => {
    const { logger, lines } = capture();
    logger.info('hello', { userId: 3, path: '/api/x' });
    expect(JSON.parse(lines[0])).toEqual({
      time: '1970-01-01T00:00:00.000Z',
      level: 'info',
      message: 'hello',
      userId: 3,
      path: '/api/x',
    });
  });

  it('巢狀物件中的機敏欄位被遮罩（邊界，SC-008）', () => {
    const { logger, lines } = capture();
    logger.error('oops', {
      body: { password: 'p1-secret', newPassword: 'p2-secret', profile: { name: 'A' } },
      config: { sessionSecret: 's3-secret' },
      headers: [{ cookie: 'sid=abc-token' }],
      passwordHash: 'scrypt$x',
    });
    const out = lines[0];
    for (const leaked of ['p1-secret', 'p2-secret', 's3-secret', 'abc-token', 'scrypt$x']) {
      expect(out).not.toContain(leaked);
    }
    const parsed = JSON.parse(out);
    expect(parsed.body.password).toBe(MASK);
    expect(parsed.body.newPassword).toBe(MASK);
    expect(parsed.body.profile.name).toBe('A');
    expect(parsed.config.sessionSecret).toBe(MASK);
    expect(parsed.headers[0].cookie).toBe(MASK);
  });

  it('silent 時不輸出', () => {
    const lines: string[] = [];
    const logger = createLogger({ sink: (l) => lines.push(l), silent: true });
    logger.warn('x');
    expect(lines).toHaveLength(0);
  });
});
