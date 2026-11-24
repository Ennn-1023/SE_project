import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TeacherActivityView } from '@buzzer/shared';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let dir: string;
let dbPath: string;
let t: ActivityTestServer | null = null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'activity-restart-'));
  dbPath = join(dir, 'buzzer.db');
});

afterEach(async () => {
  await t?.stop();
  t = null;
  rmSync(dir, { recursive: true, force: true });
});

const boot = (seed: boolean) => startActivityServer({ seed, env: { DATABASE_PATH: dbPath } });

describe('重啟恢復（004 US5-5、US5-6、FR-024、FR-026）', () => {
  it('作答中重啟：回到 WAITING、該題回到未開放、提示文字與 RESTART_CANCELLED 事件；下一次操作後清除提示', async () => {
    t = await boot(true);
    const id = await t.startActivity();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '會被捨棄');
    await t.stop();

    t = await boot(false);
    const started = Date.now();
    const teacher = await t.connectTeacher();
    const view = await teacher.waitFor(() => true, 3000);
    expect(Date.now() - started).toBeLessThan(3000);
    expect(view).toMatchObject({
      phase: 'WAITING',
      notice: '伺服器重新啟動，第 1 題作答已取消，可重新開放',
    });
    expect(view.questions[0]).toMatchObject({ status: 'NOT_OPENED', round: 0 });
    expect(t.server.ctx.repo.listAllSubmissions(id, `${id}-1`)).toEqual([]);
    const events = t.server.container.repos.activityEvents.listByActivity(id);
    expect(events.at(-1)).toMatchObject({ type: 'RESTART_CANCELLED', actorId: null });

    const reopened = (await t.api.open(`${id}-1`, 60)).body as TeacherActivityView;
    expect(reopened.notice).toBeNull();
    expect(reopened.monitor?.round).toBe(1);
  });

  it('重新開放中重啟：恢復為原有效結果（舊輪不作廢），提示保留原結果', async () => {
    t = await boot(true);
    const id = await t.startActivity();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '原結果');
    await t.api.close();
    await t.api.reopen(`${id}-1`, 60, true);
    await t.submit(await t.loginAs('S101'), `${id}-1`, '新一輪（會被捨棄）');
    await t.stop();

    t = await boot(false);
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view).toMatchObject({
      phase: 'WAITING',
      notice: '伺服器重新啟動，第 1 題重新作答已取消，保留原結果',
    });
    expect(view.questions[0]).toMatchObject({ status: 'CLOSED', round: 1, winnerTeamName: '第 2 組' });
    const result = await t.api.result(`${id}-1`);
    expect(result.body.rows[0]).toMatchObject({ teamId: 'T2', answers: [{ answer: '原結果' }] });
    expect(t.server.ctx.repo.getResult(id, `${id}-1`)).toMatchObject({ round: 1, voided: false });
  });

  it('已結束與等待開放時重啟：狀態與結果完整保留', async () => {
    t = await boot(true);
    const id = await t.startActivity();
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, '保留');
    await t.api.close();
    await t.stop();

    t = await boot(false);
    const view = (await t.api.get()).body as TeacherActivityView;
    expect(view).toMatchObject({ phase: 'CLOSED', notice: null });
    expect(view.result?.rows[0]).toMatchObject({ teamId: 'T2', rank: 1 });
  });
});
