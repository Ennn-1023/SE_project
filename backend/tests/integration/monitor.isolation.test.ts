import { afterEach, describe, expect, it } from 'vitest';
import { startActivityServer, type ActivityTestServer } from '../helpers/activity';

let t: ActivityTestServer;
afterEach(async () => {
  await t?.stop();
});

/** 只存在於老師監控資料中的欄位（FR-021） */
const MONITOR_KEYS = ['elapsedSeconds', 'submitterName', 'monitor', 'online', 'members', 'teamCount', 'submittedCount'];

describe('學生端收不到監控資料（004 US3-5、FR-021、SC-006）', () => {
  it('作答中：學生所有推播與 GET /state 都不含他組資料與監控欄位', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const aCookie = await t.loginAs('S101');
    const bCookie = await t.loginAs('S201');
    const a = await t.connect(aCookie);
    const b = await t.connect(bCookie);
    await t.connectTeacher();

    await t.api.open(`${id}-1`, 60);
    await t.submit(bCookie, `${id}-1`, 'B組秘密答案');
    await b.waitFor((v) => v.myTeamSubmission != null);
    await t.submit(aCookie, `${id}-1`, 'A組答案');
    await a.waitFor((v) => v.myTeamSubmission != null);

    const everythingA = JSON.stringify([...a.states, await t.state(aCookie)]);
    for (const leak of ['B組秘密答案', 'T2', '第 2 組', 'S201', '陳大文', 'rank', ...MONITOR_KEYS]) {
      expect(everythingA).not.toContain(leak);
    }
    const everythingB = JSON.stringify([...b.states, await t.state(bCookie)]);
    for (const leak of ['A組答案', 'S101', '王小明', ...MONITOR_KEYS]) {
      expect(everythingB).not.toContain(leak);
    }
  });

  it('結束後學生看到全部答案，但仍不含送出時間、送出者與在線資訊', async () => {
    t = await startActivityServer();
    const id = await t.startActivity();
    const aCookie = await t.loginAs('S101');
    const a = await t.connect(aCookie);
    await t.api.open(`${id}-1`, 60);
    await t.submit(await t.loginAs('S201'), `${id}-1`, 'B組答案');
    await t.api.close();
    const closed = await a.waitFor((v) => v.phase === 'CLOSED');
    expect(closed.results?.[0]).toMatchObject({ teamName: '第 2 組', answer: 'B組答案' });
    const json = JSON.stringify(closed);
    for (const leak of ['S201', '陳大文', 'receivedAt', ...MONITOR_KEYS]) {
      expect(json).not.toContain(leak);
    }
  });
});
