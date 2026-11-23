import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  loginStudent,
  loginTeacher,
  seedStudent,
  type TestApp,
} from '../helpers/testApp.js';

describe('老師管理組別（US4、FR-031～FR-033、FR-036～FR-038、FR-040）', () => {
  let t: TestApp;
  let teacher: Awaited<ReturnType<typeof loginTeacher>>;

  beforeEach(async () => {
    t = await createTestApp();
    await seedStudent(t, 'S0001', '甲');
    await seedStudent(t, 'S0002', '乙');
    await seedStudent(t, 'S0003', '丙');
    teacher = await loginTeacher(t);
  });

  const setCount = (groupCount: unknown) =>
    teacher.put('/api/groups/settings').send({ groupCount });
  const assign = (studentId: string, groupNumber: unknown) =>
    teacher.put(`/api/groups/assignments/${studentId}`).send({ groupNumber });

  it('設為 4 成功，學生端 GET /api/groups/me 立即回 4（正常）', async () => {
    const res = await setCount(4);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupCount: 4 });
    const student = await loginStudent(t, 'S0001');
    expect((await student.get('/api/groups/me')).body).toEqual({
      groupNumber: null,
      groupCount: 4,
    });
  });

  it.each<[unknown, string]>([
    [-1, '負數'],
    [51, '超過上限'],
    [2.5, '非整數'],
    ['4', '字串'],
    [null, 'null'],
  ])('組數 %j（%s）回 400 並說明允許範圍（邊界）', async (value) => {
    const res = await setCount(value);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'groupCount' });
    expect(res.body.error.hint).toContain('0–50');
  });

  it('組數 0 與 50 可設定（邊界）', async () => {
    expect((await setCount(50)).status).toBe(200);
    expect((await setCount(0)).status).toBe(200);
  });

  it('第 4 組有成員時調為 3 回 409 GROUP_NOT_EMPTY 並列出 blockingGroups', async () => {
    await setCount(5);
    await assign('S0001', 4);
    await assign('S0002', 5);
    const res = await setCount(3);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'GROUP_NOT_EMPTY',
      field: 'groupCount',
      message: '第 4、5 組仍有成員，無法將組數調降為 3',
      details: {
        blockingGroups: [
          { groupNumber: 4, members: [{ studentId: 'S0001', name: '甲' }] },
          { groupNumber: 5, members: [{ studentId: 'S0002', name: '乙' }] },
        ],
      },
    });
    expect((await teacher.get('/api/groups/settings')).body.groupCount).toBe(5);
  });

  it('全部未分組時可設為 0；有人分組時不可設為 0', async () => {
    await setCount(3);
    await assign('S0003', 1);
    expect((await setCount(0)).status).toBe(409);
    await assign('S0003', null);
    expect((await setCount(0)).status).toBe(200);
  });

  it('指派到 2 與改回 null 成功；改回未分配後學生可再自選（FR-036）', async () => {
    await setCount(3);
    const a = await assign('s0001', 2);
    expect(a.status).toBe(200);
    expect(a.body.student).toEqual({
      studentId: 'S0001',
      name: '甲',
      groupNumber: 2,
      usingDefaultPassword: true,
    });
    await assign('S0001', 3);
    expect(t.container.repos.users.findStudent('S0001')!.groupNumber).toBe(3);
    const back = await assign('S0001', null);
    expect(back.body.student.groupNumber).toBeNull();
    const student = await loginStudent(t, 'S0001');
    expect((await student.post('/api/groups/me').send({ groupNumber: 1 })).status).toBe(200);
  });

  it('指派到 5（> N）、0、非整數、缺欄位回 400（邊界）', async () => {
    await setCount(4);
    const over = await assign('S0001', 5);
    expect(over.status).toBe(400);
    expect(over.body.error).toMatchObject({ field: 'groupNumber', message: '可選範圍為 1–4' });
    expect(over.body.error.details).toEqual({ groupCount: 4 });
    expect((await assign('S0001', 0)).status).toBe(400);
    expect((await assign('S0001', 1.5)).status).toBe(400);
    expect((await teacher.put('/api/groups/assignments/S0001').send({})).status).toBe(400);
  });

  it('組數為 0 時指派到任何組回 400，但可改回未分配', async () => {
    expect((await assign('S0001', 1)).status).toBe(400);
    expect((await assign('S0001', null)).status).toBe(200);
  });

  it('不存在的學號回 404；學號格式錯誤回 400', async () => {
    await setCount(3);
    const missing = await assign('Z9999', 1);
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    expect((await assign('a-b', 1)).status).toBe(400);
  });

  it('GET /api/groups/overview 含 0 人的組與未分組清單（FR-038）', async () => {
    await setCount(3);
    await assign('S0002', 1);
    await assign('S0001', 1);
    const res = await teacher.get('/api/groups/overview');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      groupCount: 3,
      groups: [
        {
          groupNumber: 1,
          memberCount: 2,
          members: [
            { studentId: 'S0001', name: '甲' },
            { studentId: 'S0002', name: '乙' },
          ],
        },
        { groupNumber: 2, memberCount: 0, members: [] },
        { groupNumber: 3, memberCount: 0, members: [] },
      ],
      unassigned: [{ studentId: 'S0003', name: '丙' }],
    });
  });

  it('組數為 0 時總覽沒有組別，所有學生都在未分組清單', async () => {
    const res = await teacher.get('/api/groups/overview');
    expect(res.body.groups).toEqual([]);
    expect(res.body.unassigned).toHaveLength(3);
  });
});
