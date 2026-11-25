import { afterEach, describe, expect, it } from 'vitest';
import type { TeacherActivityView } from '@buzzer/shared';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
afterEach(async () => {
  await t?.stop();
});

const onlineOf = (v: TeacherActivityView, teamId: string) =>
  v.monitor?.teams.find((r) => r.teamId === teamId)?.online ??
  v.readiness?.teams.find((r) => r.teamId === teamId)?.online;

describe('各組在線狀態（004 US6、FR-022）', () => {
  it('同一學生多分頁計為 1 人；關閉所有分頁後推送離線', async () => {
    t = await startActivityServer();
    const teacher = await t.connectTeacher();
    const cookie = await t.loginAs('S101');
    const tab1 = await t.connect(cookie);
    const tab2 = await t.connect(cookie);
    const online = await teacher.waitFor((v) => onlineOf(v, 'T1') === 1, 2000);
    expect(online.readiness!.teams.find((x) => x.teamId === 'T1')).toMatchObject({ members: 2, online: 1 });

    tab1.socket.disconnect();
    await new Promise((r) => setTimeout(r, 500));
    expect(onlineOf((await t.api.get()).body, 'T1')).toBe(1);
    tab2.socket.disconnect();
    await teacher.waitFor((v) => onlineOf(v, 'T1') === 0, 2000);
  });

  it('作答中的看板也顯示在線人數', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    await t.connect(await t.loginAs('S201'));
    await t.api.open(`${id}-1`, 60);
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view.monitor!.teams.find((r) => r.teamId === 'T2')).toMatchObject({ online: 1, members: 1 });
    expect(view.monitor!.teams.find((r) => r.teamId === 'T3')).toMatchObject({ online: 0 });
  });

  it('連線變化節流：快速多次連線只產生少量推播（≤ 每 300 ms 一次）', async () => {
    t = await startActivityServer();
    const teacher = await t.connectTeacher();
    await teacher.waitFor(() => true);
    const before = teacher.views.length;
    for (const s of ['S101', 'S201', 'S301', 'S401']) await t.connect(await t.loginAs(s));
    await new Promise((r) => setTimeout(r, 700));
    const pushes = teacher.views.length - before;
    expect(pushes).toBeGreaterThanOrEqual(1);
    expect(pushes).toBeLessThanOrEqual(3);
    expect(teacher.last()!.readiness!.teams.filter((x) => x.online > 0)).toHaveLength(4);
  });

  it('伺服器設定 pingInterval／pingTimeout，異常斷線約 9 秒內偵測（10 秒內反映）', async () => {
    t = await startActivityServer();
    const io = (t.server.ctx.realtime as unknown as { io: { engine: { opts: { pingInterval: number; pingTimeout: number } } } }).io;
    expect(io.engine.opts.pingInterval + io.engine.opts.pingTimeout).toBeLessThanOrEqual(10_000);
  });
});
