import { beforeEach, describe, expect, it } from 'vitest';
import { createTestApp, loginAs, loginTeacher, type TestApp } from '../helpers/testApp.js';

describe('POST /api/students、GET /api/students（US1、FR-010～FR-012、FR-015、FR-026）', () => {
  let t: TestApp;
  let teacher: Awaited<ReturnType<typeof loginTeacher>>;

  beforeEach(async () => {
    t = await createTestApp();
    teacher = await loginTeacher(t);
  });

  const create = (studentId: unknown, name: unknown) =>
    teacher.post('/api/students').send({ studentId, name });

  it('建立學生回 201：未分配、使用預設密碼，學號轉大寫、姓名去除空白（正常）', async () => {
    const res = await create(' b1103 ', '  王小明 ');
    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      student: {
        studentId: 'B1103',
        name: '王小明',
        groupNumber: null,
        usingDefaultPassword: true,
      },
    });
  });

  it('建立後學生可用預設密碼登入', async () => {
    await create('B1103', '王小明');
    const agent = t.agent();
    const res = await loginAs(agent, 'B1103', t.config.studentDefaultPassword);
    expect(res.body.user.role).toBe('STUDENT');
  });

  it('b1103 與既有 B1103 衝突回 409，原帳號不變（FR-011）', async () => {
    await create('B1103', '王小明');
    t.container.repos.users.updateGroup('B1103', null);
    const before = t.container.repos.users.findStudent('B1103')!;
    const res = await create('b1103', '另一人');
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'STUDENT_EXISTS',
      field: 'studentId',
      message: '學號 B1103 已存在',
    });
    const after = t.container.repos.users.findStudent('B1103')!;
    expect(after.displayName).toBe('王小明');
    expect(after.passwordHash).toBe(before.passwordHash);
  });

  it('連續快速送出兩次只建立一個帳號', async () => {
    const [a, b] = await Promise.all([create('C2001', '甲'), create('C2001', '甲')]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(t.container.repos.users.listStudents()).toHaveLength(1);
  });

  it.each([
    ['T 01', '學號含空白'],
    ['T-001', '學號含符號'],
    ['ABC', '學號 3 字元'],
    ['A'.repeat(21), '學號 21 字元'],
    ['', '學號空白'],
  ])('學號 %j（%s）回 400 並指出 studentId（邊界）', async (studentId) => {
    const res = await create(studentId, '測試');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.field).toBe('studentId');
    expect(res.body.error.hint).toContain('4–20');
  });

  it('學號剛好 4 與 20 字元可建立（邊界）', async () => {
    expect((await create('A123', '甲')).status).toBe(201);
    expect((await create('B'.repeat(20), '乙')).status).toBe(201);
  });

  it.each([
    ['   ', '姓名空白'],
    ['名'.repeat(51), '姓名 51 字元'],
  ])('姓名 %j（%s）回 400 並指出 name（邊界）', async (name) => {
    const res = await create('B1103', name);
    expect(res.status).toBe(400);
    expect(res.body.error.field).toBe('name');
    expect(res.body.error.hint).toBeTruthy();
  });

  it('姓名剛好 50 字元可建立（邊界）', async () => {
    expect((await create('B1103', '名'.repeat(50))).status).toBe(201);
  });

  it('缺少欄位或型別錯誤回 400', async () => {
    expect((await teacher.post('/api/students').send({ name: 'x' })).body.error.field).toBe(
      'studentId',
    );
    expect((await create(1234, '甲')).body.error.field).toBe('studentId');
  });

  it('GET /api/students 依學號排序且不含密碼欄位', async () => {
    await create('C0003', '丙');
    await create('A0001', '甲');
    await create('B0002', '乙');
    const res = await teacher.get('/api/students');
    expect(res.status).toBe(200);
    expect(res.body.students.map((s: { studentId: string }) => s.studentId)).toEqual([
      'A0001',
      'B0002',
      'C0003',
    ]);
    expect(Object.keys(res.body.students[0]).sort()).toEqual(
      ['groupNumber', 'name', 'studentId', 'usingDefaultPassword'].sort(),
    );
    expect(res.text).not.toMatch(/scrypt|password_hash|passwordHash/);
  });
});
