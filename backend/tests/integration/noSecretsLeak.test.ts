import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import { createTestApp, loginAs } from '../helpers/testApp.js';

describe('機敏資料不外洩（SC-008、FR-020、憲章原則 III）', () => {
  it('所有回應 body 與 log 輸出都不含密碼、session secret、sid token 或密碼雜湊', async () => {
    const logLines: string[] = [];
    const t = await createTestApp({
      logger: createLogger({ sink: (line) => logLines.push(line), silent: false }),
    });
    const bodies: string[] = [];
    const tokens: string[] = [];
    const record = (res: { text: string; headers: Record<string, unknown> }) => {
      bodies.push(res.text ?? '');
      const cookies = (res.headers['set-cookie'] as string[] | undefined) ?? [];
      for (const c of cookies) {
        const value = c.split(';')[0]!.split('=')[1];
        if (value) tokens.push(value);
      }
      return res;
    };

    const teacher = t.agent();
    record(await loginAs(teacher, t.config.teacherAccount, t.config.teacherInitialPassword));
    record(await teacher.post('/api/students').send({ studentId: 'S0001', name: '甲' }));
    record(await teacher.post('/api/students').send({ studentId: 's0001', name: '重複' }));
    record(await teacher.post('/api/students').send({ studentId: 'bad id', name: '' }));
    record(await teacher.get('/api/students'));
    record(await teacher.put('/api/groups/settings').send({ groupCount: 3 }));
    record(await teacher.get('/api/groups/overview'));

    const student = t.agent();
    record(await loginAs(student, 'S0001', t.config.studentDefaultPassword));
    record(await student.get('/api/auth/me'));
    record(await student.get('/api/students'));
    record(
      await student.post('/api/auth/change-password').send({
        currentPassword: 'wrong-current',
        newPassword: 'leak-check-new-pw',
        confirmPassword: 'leak-check-new-pw',
      }),
    );
    record(
      await student.post('/api/auth/change-password').send({
        currentPassword: t.config.studentDefaultPassword,
        newPassword: t.config.studentDefaultPassword,
        confirmPassword: t.config.studentDefaultPassword,
      }),
    );
    record(
      await student.post('/api/auth/change-password').send({
        currentPassword: t.config.studentDefaultPassword,
        newPassword: 'leak-check-new-pw',
        confirmPassword: 'leak-check-new-pw',
      }),
    );
    record(await teacher.post('/api/students/S0001/reset-password'));
    for (let i = 0; i < 6; i++) {
      record(
        await t
          .request()
          .post('/api/auth/login')
          .send({ account: 'S0001', password: `wrong-${i}` }),
      );
    }
    record(await t.request().post('/api/auth/login').send({ account: 'NOBODY', password: 'x' }));

    // 觸發一次未預期錯誤，確認 500 回應與 log 都不帶機敏內容
    const original = t.container.repos.users.listStudents.bind(t.container.repos.users);
    t.container.repos.users.listStudents = () => {
      throw new Error('simulated failure');
    };
    const boom = record(await teacher.get('/api/students'));
    t.container.repos.users.listStudents = original;
    expect(boom.text).toContain('系統發生錯誤，請稍後再試');
    expect(logLines.length).toBeGreaterThan(0);

    const hashes = (
      t.db.prepare('SELECT password_hash FROM users').all() as { password_hash: string }[]
    ).map((r) => r.password_hash);
    const secrets = [
      t.config.studentDefaultPassword,
      t.config.teacherInitialPassword,
      t.config.sessionSecret,
      'leak-check-new-pw',
      ...tokens,
      ...hashes,
    ];
    expect(tokens.length).toBeGreaterThanOrEqual(2);

    const haystacks = [...bodies, ...logLines];
    for (const secret of secrets) {
      for (const text of haystacks) {
        expect(
          text.includes(secret),
          `洩漏：${secret.slice(0, 6)}… 出現在 ${text.slice(0, 80)}`,
        ).toBe(false);
      }
    }
    expect(haystacks.join('\n')).not.toMatch(/scrypt\$/);
  });
});
