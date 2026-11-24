import { beforeEach, describe, expect, it } from 'vitest';
import {
  createTestApp,
  loginStudent,
  seedStudent,
  setGroupCount,
  type TestApp,
} from '../helpers/testApp.js';

describe('學生自選組別（US3、FR-034、FR-035、FR-039、FR-040）', () => {
  let t: TestApp;
  let student: Awaited<ReturnType<typeof loginStudent>>;

  beforeEach(async () => {
    t = await createTestApp();
    await seedStudent(t, 'S0001', '甲');
    setGroupCount(t, 5);
    student = await loginStudent(t, 'S0001');
  });

  const select = (groupNumber: unknown) =>
    student.post('/api/groups/me').send(groupNumber === undefined ? {} : { groupNumber });

  it('GET /api/groups/me 回 groupNumber 與 groupCount', async () => {
    const res = await student.get('/api/groups/me');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupNumber: null, groupCount: 5 });
  });

  it('GET /api/groups/settings 任何已登入者可讀', async () => {
    const res = await student.get('/api/groups/settings');
    expect(res.body).toEqual({ groupCount: 5 });
  });

  it('未分配學生選第 3 組成功（正常）', async () => {
    const res = await select(3);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ groupNumber: 3, groupCount: 5 });
    expect(t.container.repos.users.findStudent('S0001')!.groupNumber).toBe(3);
    expect((await student.get('/api/groups/me')).body.groupNumber).toBe(3);
  });

  it('已分組再選回 409 ALREADY_ASSIGNED 並附 currentGroupNumber', async () => {
    await select(3);
    const res = await select(4);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: 'ALREADY_ASSIGNED',
      message: '你已分組，如需更換請洽老師',
      details: { currentGroupNumber: 3 },
    });
    expect(t.container.repos.users.findStudent('S0001')!.groupNumber).toBe(3);
  });

  it.each<[unknown, string]>([
    [0, '0'],
    [6, '超過組數'],
    ['3', '字串'],
    [3.5, '非整數'],
    [undefined, '缺欄位'],
    [null, 'null'],
  ])('選 %j（%s）回 400 並附最新 groupCount（邊界）', async (value) => {
    const res = await select(value);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.field).toBe('groupNumber');
    expect(res.body.error.details).toEqual({ groupCount: 5 });
    expect(t.container.repos.users.findStudent('S0001')!.groupNumber).toBeNull();
  });

  it('超出範圍時訊息說明可選範圍 1–5', async () => {
    const res = await select(6);
    expect(res.body.error.message).toBe('可選範圍為 1–5');
  });

  it('選第 1 與第 N 組皆可（邊界）', async () => {
    expect((await select(5)).status).toBe(200);
    await seedStudent(t, 'S0002', '乙');
    const other = await loginStudent(t, 'S0002');
    expect((await other.post('/api/groups/me').send({ groupNumber: 1 })).status).toBe(200);
  });

  it('組數為 0 時回 409 GROUPS_NOT_OPEN', async () => {
    setGroupCount(t, 0);
    const res = await select(1);
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'GROUPS_NOT_OPEN', message: '老師尚未開放分組' });
    expect((await student.get('/api/groups/me')).body).toEqual({
      groupNumber: null,
      groupCount: 0,
    });
  });

  it('老師已先指派到第 2 組，學生再自選回 409 且組別仍為 2（FR-035）', async () => {
    t.container.repos.users.updateGroup('S0001', 2);
    const res = await select(4);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ASSIGNED');
    expect(res.body.error.details.currentGroupNumber).toBe(2);
    expect(t.container.repos.users.findStudent('S0001')!.groupNumber).toBe(2);
  });

  it('同一學生同時送出兩次選組，只有一次成功（FR-037）', async () => {
    const [a, b] = await Promise.all([select(1), select(2)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const g = t.container.repos.users.findStudent('S0001')!.groupNumber;
    expect([1, 2]).toContain(g);
  });
});
