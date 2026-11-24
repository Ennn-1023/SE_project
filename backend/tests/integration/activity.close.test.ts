import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TeacherActivityView } from '@buzzer/shared';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
let id: string;
afterEach(async () => {
  vi.useRealTimers();
  await t?.stop();
});

async function setup() {
  t = await startActivityServer();
  id = await t.startActivity();
}

const closedEvents = () =>
  t.server.container.repos.activityEvents.listByActivity(id).filter((e) => e.type === 'QUESTION_CLOSED');

describe('結束搶答（004 US2、FR-009～FR-011、FR-029）', () => {
  it('時間到由伺服器自動結束（TIME_UP），老師與學生收到結束；事件 actor 為 null', async () => {
    await setup();
    const teacher = await t.connectTeacher();
    await t.api.open(`${id}-1`, 5);
    const ended = await teacher.waitFor((v) => v.phase === 'CLOSED', 7000);
    expect(ended.result).toMatchObject({ closedReason: 'TIME_UP', noSubmission: true });
    expect(t.server.ctx.repo.getQuestion(`${id}-1`)).toMatchObject({ status: 'CLOSED', closedReason: 'TIME_UP' });
    expect(closedEvents()).toEqual([
      expect.objectContaining({ questionId: `${id}-1`, actorId: null, detail: '時間到' }),
    ]);
  }, 10_000);

  it('手動結束（MANUAL）記錄老師為操作者；題目已結束時再按為 200 無變化（US2-4、US2-5）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    const res = await t.api.close();
    expect(res.status).toBe(200);
    expect((res.body as TeacherActivityView).result).toMatchObject({ closedReason: 'MANUAL' });
    const again = await t.api.close();
    expect(again.status).toBe(200);
    expect(again.body.phase).toBe('CLOSED');
    expect(closedEvents()).toEqual([
      expect.objectContaining({ actorId: expect.any(Number), detail: '手動結束' }),
    ]);
    expect(t.server.ctx.repo.listResults(id)).toHaveLength(1);
  });

  it('等待開放時手動結束回 409', async () => {
    await setup();
    const res = await t.api.close();
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('作答中結束活動：連帶結束題目（ACTIVITY_ENDED），事件 actor 為 null', async () => {
    await setup();
    await t.api.open(`${id}-1`, 60);
    await t.api.end();
    expect(t.server.ctx.repo.getResult(id, `${id}-1`)).toMatchObject({ closedReason: 'ACTIVITY_ENDED' });
    expect(closedEvents()).toEqual([expect.objectContaining({ actorId: null, detail: '結束活動' })]);
  });

  it('時間到與手動結束幾乎同時：只產生一筆結果，老師不會看到錯誤（SC-004）', async () => {
    await setup();
    await t.api.open(`${id}-1`, 5);
    await new Promise((r) => setTimeout(r, 4990));
    const res = await t.api.close();
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 100));
    expect(t.server.ctx.repo.listResults(id)).toHaveLength(1);
    expect(closedEvents()).toHaveLength(1);
  }, 10_000);
});
