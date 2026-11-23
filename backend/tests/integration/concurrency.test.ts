import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PasswordHasher } from '../../src/lib/password.js';
import { createTestApp, setGroupCount, type TestApp } from '../helpers/testApp.js';

const STUDENTS = 60;
const LIMIT_MS = 3000;

/** 以正式 scrypt 參數（research R6）在真實 HTTP 伺服器上模擬全班同時操作（SC-007）。 */
describe('併發：60 位學生同時登入與選組（SC-007、FR-035、FR-037）', () => {
  let t: TestApp;
  let server: Server;
  let base: string;
  const ids = Array.from({ length: STUDENTS }, (_, i) => `C${String(i + 1).padStart(4, '0')}`);

  beforeAll(async () => {
    t = await createTestApp({ hasher: new PasswordHasher() });
    const hash = await t.container.hasher.hash(t.config.studentDefaultPassword);
    for (const id of ids) t.container.repos.users.createStudent(id, `學生${id}`, hash);
    setGroupCount(t, 10);
    server = t.app.listen(0);
    await new Promise<void>((r) => server.once('listening', () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  }, 60_000);

  afterAll(() => new Promise<void>((r) => server.close(() => r())));

  async function timed(url: string, init: RequestInit) {
    const start = performance.now();
    const res = await fetch(base + url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });
    const body = res.status === 204 ? null : await res.json();
    return { res, body, ms: performance.now() - start };
  }

  const login = (account: string, password: string) =>
    timed('/auth/login', { method: 'POST', body: JSON.stringify({ account, password }) });

  const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];

  it('60 人同時登入後同時選組：每個請求 ≤ 3 秒，每人恰屬一組', async () => {
    const logins = await Promise.all(ids.map((id) => login(id, t.config.studentDefaultPassword)));
    for (const l of logins) {
      expect(l.res.status).toBe(200);
      expect(l.ms).toBeLessThanOrEqual(LIMIT_MS);
    }
    const cookies = logins.map((l) => cookieOf(l.res));

    const selects = await Promise.all(
      cookies.map((cookie, i) =>
        timed('/groups/me', {
          method: 'POST',
          headers: { Cookie: cookie },
          body: JSON.stringify({ groupNumber: (i % 10) + 1 }),
        }),
      ),
    );
    for (const s of selects) {
      expect(s.res.status).toBe(200);
      expect(s.ms).toBeLessThanOrEqual(LIMIT_MS);
    }

    const students = t.container.repos.users.listStudents();
    expect(students).toHaveLength(STUDENTS);
    for (const [i, s] of students.entries()) {
      expect(s.groupNumber).toBe((i % 10) + 1);
    }
    const total = students.filter((s) => s.groupNumber !== null).length;
    expect(total).toBe(STUDENTS);
  }, 60_000);

  it('同時送出學生自選與老師指派（重複多輪）：最終一律為老師指派的組別，無錯誤狀態', async () => {
    const teacher = await login(t.config.teacherAccount, t.config.teacherInitialPassword);
    const teacherCookie = cookieOf(teacher.res);
    const id = ids[0];
    const student = await login(id, t.config.studentDefaultPassword);
    const studentCookie = cookieOf(student.res);

    for (let round = 0; round < 20; round++) {
      t.container.repos.users.updateGroup(id, null);
      const target = (round % 9) + 2; // 老師指派 2..10
      const self = round % 2 === 0 ? 1 : 10;
      const [s, a] = await Promise.all([
        timed('/groups/me', {
          method: 'POST',
          headers: { Cookie: studentCookie },
          body: JSON.stringify({ groupNumber: self }),
        }),
        timed(`/groups/assignments/${id}`, {
          method: 'PUT',
          headers: { Cookie: teacherCookie },
          body: JSON.stringify({ groupNumber: target }),
        }),
      ]);
      expect(a.res.status).toBe(200);
      expect([200, 409]).toContain(s.res.status);
      if (s.res.status === 409) expect(s.body.error.code).toBe('ALREADY_ASSIGNED');
      expect(t.container.repos.users.findStudent(id)!.groupNumber).toBe(target);
    }
  }, 60_000);
});
