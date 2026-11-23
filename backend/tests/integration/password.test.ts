import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  loginAs,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';

const NEW_PW = 'brand-new-pw-01';

describe('修改密碼（US5、FR-024、FR-027）', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
    await seedStudent(t, 'S0001', '甲');
  });

  const change = (
    agent: ReturnType<TestApp['agent']>,
    currentPassword: unknown,
    newPassword: unknown,
    confirmPassword: unknown = newPassword,
  ) =>
    agent.post('/api/auth/change-password').send({ currentPassword, newPassword, confirmPassword });

  const tryLogin = (account: string, password: string) =>
    t.request().post('/api/auth/login').send({ account, password });

  it('成功回 204；舊密碼登入 401、新密碼登入 200；usingDefaultPassword 變 false（正常）', async () => {
    const student = await loginStudent(t, 'S0001');
    const res = await change(student, t.config.studentDefaultPassword, NEW_PW);
    expect(res.status).toBe(204);
    expect((await tryLogin('S0001', t.config.studentDefaultPassword)).status).toBe(401);
    expect((await tryLogin('S0001', NEW_PW)).status).toBe(200);
    expect(t.container.repos.users.findStudent('S0001')!.usingDefaultPassword).toBe(false);
    // 修改密碼不會登出目前裝置
    expect((await student.get('/api/auth/me')).status).toBe(200);
  });

  it('目前密碼錯誤回 400 INVALID_CURRENT_PASSWORD，且 session 仍有效', async () => {
    const student = await loginStudent(t, 'S0001');
    const res = await change(student, 'not-current', NEW_PW);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: 'INVALID_CURRENT_PASSWORD',
      field: 'currentPassword',
      message: '目前密碼不正確',
    });
    expect((await student.get('/api/auth/me')).status).toBe(200);
    expect((await tryLogin('S0001', t.config.studentDefaultPassword)).status).toBe(200);
  });

  it.each<[string, string, string, string]>([
    ['7 字元', 'abcdefg', 'abcdefg', 'newPassword'],
    ['65 字元', 'a'.repeat(65), 'a'.repeat(65), 'newPassword'],
    ['兩次不一致', 'brand-new-pw-01', 'brand-new-pw-02', 'confirmPassword'],
  ])('新密碼%s回 400 並指出欄位（邊界）', async (_label, next, confirm, field) => {
    const student = await loginStudent(t, 'S0001');
    const res = await change(student, t.config.studentDefaultPassword, next, confirm);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field });
    expect(res.body.error.hint).toBeTruthy();
  });

  it('新密碼等於預設密碼回 400（邊界）', async () => {
    const student = await loginStudent(t, 'S0001');
    const res = await change(
      student,
      t.config.studentDefaultPassword,
      t.config.studentDefaultPassword,
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'newPassword' });
    expect(JSON.stringify(res.body)).not.toContain(t.config.studentDefaultPassword);
  });

  it('新密碼剛好 8 與 64 字元可設定（邊界）', async () => {
    const student = await loginStudent(t, 'S0001');
    expect((await change(student, t.config.studentDefaultPassword, 'abcdefgh')).status).toBe(204);
    expect((await change(student, 'abcdefgh', 'x'.repeat(64))).status).toBe(204);
  });

  it('未登入回 401', async () => {
    const res = await change(t.agent(), 'a', NEW_PW);
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('老師修改自己的密碼回 204、新密碼可登入，之後 seedTeacher 不會覆蓋（FR-024）', async () => {
    const teacher = await loginTeacher(t);
    expect((await change(teacher, t.config.teacherInitialPassword, NEW_PW)).status).toBe(204);
    await t.container.services.accounts.seedTeacher();
    expect((await tryLogin(t.config.teacherAccount, NEW_PW)).status).toBe(200);
    expect((await tryLogin(t.config.teacherAccount, t.config.teacherInitialPassword)).status).toBe(
      401,
    );
  });

  it('使用預設密碼登入的學生 /api/auth/me 不含任何改密碼要求（FR-027）', async () => {
    const student = await loginStudent(t, 'S0001');
    const me = await student.get('/api/auth/me');
    expect(me.body.user).toEqual({
      account: 'S0001',
      displayName: '甲',
      role: 'STUDENT',
      groupNumber: null,
    });
    expect(JSON.stringify(me.body)).not.toMatch(/mustChange|changePassword|usingDefault/i);
  });
});

describe('老師重設學生密碼（US5、FR-025）', () => {
  let t: TestApp;

  beforeEach(async () => {
    t = await createTestApp();
    await seedStudent(t, 'S0001', '甲');
  });

  it('回 204，該生兩個裝置的 session 都失效，預設密碼可登入、usingDefaultPassword 為 true', async () => {
    const phone = await loginStudent(t, 'S0001');
    const laptop = await loginStudent(t, 'S0001');
    await phone.post('/api/auth/change-password').send({
      currentPassword: t.config.studentDefaultPassword,
      newPassword: NEW_PW,
      confirmPassword: NEW_PW,
    });
    const teacher = await loginTeacher(t);

    const res = await teacher.post('/api/students/s0001/reset-password');
    expect(res.status).toBe(204);
    expect((await phone.get('/api/auth/me')).status).toBe(401);
    expect((await laptop.get('/api/auth/me')).status).toBe(401);
    expect(t.container.repos.users.findStudent('S0001')!.usingDefaultPassword).toBe(true);

    const again = t.agent();
    await loginAs(again, 'S0001', t.config.studentDefaultPassword);
    expect((await teacher.get('/api/students')).body.students[0].usingDefaultPassword).toBe(true);
    // 老師自己的 session 不受影響
    expect((await teacher.get('/api/auth/me')).status).toBe(200);
  });

  it('重設會解除登入鎖定', async () => {
    for (let i = 0; i < 5; i++) {
      await t.request().post('/api/auth/login').send({ account: 'S0001', password: 'wrong' });
    }
    const teacher = await loginTeacher(t);
    await teacher.post('/api/students/S0001/reset-password');
    const res = await t
      .request()
      .post('/api/auth/login')
      .send({ account: 'S0001', password: t.config.studentDefaultPassword });
    expect(res.status).toBe(200);
  });

  it('不存在學號回 404；格式錯誤回 400（邊界）', async () => {
    const teacher = await loginTeacher(t);
    const missing = await teacher.post('/api/students/Z9999/reset-password');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect((await teacher.post('/api/students/a-b/reset-password')).status).toBe(400);
  });

  it('不能用來重設老師帳號', async () => {
    const teacher = await loginTeacher(t);
    const res = await teacher.post('/api/students/TEACHER/reset-password');
    expect(res.status).toBe(404);
  });
});
