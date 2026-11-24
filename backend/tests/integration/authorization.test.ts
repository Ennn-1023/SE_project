import { beforeAll, describe, expect, it } from 'vitest';
import {
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  setGroupCount,
  type TestApp,
} from '../helpers/testApp.js';

type Method = 'get' | 'post' | 'put';
interface Endpoint {
  method: Method;
  path: string;
  body?: object;
  implemented: boolean;
}

/** 所有老師端點（SC-004：100% 的老師功能在學生身分下被拒絕）。 */
const TEACHER_ENDPOINTS: Endpoint[] = [
  { method: 'get', path: '/api/students', implemented: true },
  {
    method: 'post',
    path: '/api/students',
    body: { studentId: 'N0001', name: '新生' },
    implemented: true,
  },
  { method: 'post', path: '/api/students/S0002/reset-password', implemented: true },
  { method: 'put', path: '/api/groups/settings', body: { groupCount: 3 }, implemented: true },
  { method: 'get', path: '/api/groups/overview', implemented: true },
  {
    method: 'put',
    path: '/api/groups/assignments/S0001',
    body: { groupNumber: 1 },
    implemented: true,
  },
];

/** 學生專用端點：老師呼叫回 403。 */
const STUDENT_ENDPOINTS: Endpoint[] = [
  { method: 'get', path: '/api/groups/me', implemented: true },
  { method: 'post', path: '/api/groups/me', body: { groupNumber: 1 }, implemented: true },
];

describe('角色權限（US2、FR-021、SC-004）', () => {
  let t: TestApp;
  let teacher: Awaited<ReturnType<typeof loginTeacher>>;
  let student: Awaited<ReturnType<typeof loginStudent>>;

  beforeAll(async () => {
    t = await createTestApp();
    await seedStudent(t, 'S0001', '甲');
    await seedStudent(t, 'S0002', '乙'); // 重設密碼端點的對象，避免登出 S0001
    setGroupCount(t, 3);
    teacher = await loginTeacher(t);
    student = await loginStudent(t, 'S0001');
  });

  const call = (agent: ReturnType<TestApp['agent']> | null, e: Endpoint) => {
    const target = agent ?? t.request();
    const req = target[e.method](e.path);
    return e.body ? req.send(e.body) : req;
  };

  for (const e of TEACHER_ENDPOINTS) {
    const name = `${e.method.toUpperCase()} ${e.path}`;
    if (!e.implemented) {
      it.todo(`${name}：未登入 401、學生 403、老師可使用`);
      continue;
    }
    it(`${name}：未登入回 401 UNAUTHENTICATED`, async () => {
      const res = await call(null, e);
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    });
    it(`${name}：學生回 403「此功能僅限老師使用」`, async () => {
      const res = await call(student, e);
      expect(res.status).toBe(403);
      expect(res.body.error).toEqual({ code: 'FORBIDDEN', message: '此功能僅限老師使用' });
    });
    it(`${name}：老師不回 401／403`, async () => {
      const res = await call(teacher, e);
      expect([401, 403]).not.toContain(res.status);
    });
  }

  for (const e of STUDENT_ENDPOINTS) {
    const name = `${e.method.toUpperCase()} ${e.path}`;
    if (!e.implemented) {
      it.todo(`${name}：未登入 401、老師 403`);
      continue;
    }
    it(`${name}：未登入回 401`, async () => {
      expect((await call(null, e)).status).toBe(401);
    });
    it(`${name}：老師回 403「此功能僅限學生使用」`, async () => {
      const res = await call(teacher, e);
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });
  }

  it('學生被拒絕時不會產生任何副作用（建立學生）', async () => {
    await call(student, { ...TEACHER_ENDPOINTS[1]!, body: { studentId: 'X9999', name: '偷建' } });
    expect(t.container.repos.users.findStudent('X9999')).toBeNull();
  });
});
