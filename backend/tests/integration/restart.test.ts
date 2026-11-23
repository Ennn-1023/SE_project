import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startTestServer, type TestServer } from '../helpers/testServer';

let dir: string;
let dbPath: string;
let t: TestServer | null = null;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'buzzer-restart-'));
  dbPath = join(dir, 'buzzer.db');
});

afterEach(async () => {
  await t?.stop();
  t = null;
  rmSync(dir, { recursive: true, force: true });
});

const start = () => startTestServer({ DATABASE_PATH: dbPath });

describe('伺服器重啟（US4、Q-T14、FR-020、FR-020a、SC-008）', () => {
  it('作答中重啟：回到 WAITING，該題送出全部捨棄；已結束題目的資料完整保留；該題可重新開放', async () => {
    t = await start();
    const tokB = await t.loginAs('S201');
    const tokA = await t.loginAs('S101');

    // Q1 正常結束
    await t.teacher.open('Q1', 60);
    await t.submit(tokB, 'Q1', 'Q1 的 B 答案');
    await t.submit(tokA, 'Q1', 'Q1 的 A 答案');
    await t.teacher.close();
    await t.teacher.next();

    // Q2 作答中送出後重啟
    await t.teacher.open('Q2', 60);
    await t.submit(tokB, 'Q2', 'Q2 會被捨棄');
    await t.stop();

    t = await start();
    // token 由同一個 SESSION_SECRET 簽發，重啟後仍有效
    const view = await t.state(tokB);
    expect(view).toMatchObject({ phase: 'WAITING' });
    expect(view.question).toBeUndefined();
    expect(view.myTeamSubmission).toBeUndefined();

    const results = (await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie)).body;
    expect(results).toEqual([
      expect.objectContaining({ question_id: 'Q1', answer: 'Q1 的 B 答案', winner_team: 'T2' }),
    ]);
    expect((await t.http.get('/api/dev/submissions').set('Cookie', t.teacherCookie).query({ questionId: 'Q1' })).body).toHaveLength(2);
    expect((await t.http.get('/api/dev/submissions').set('Cookie', t.teacherCookie).query({ questionId: 'Q2' })).body).toEqual([]);

    // Q2 沒有結果，可以重新開放，各組重新送出
    expect((await t.teacher.open('Q2', 60)).status).toBe(200);
    expect((await t.submit(tokB, 'Q2', '重新送出')).status).toBe(201);
  });

  it('已結束時重啟：學生重連後看到重啟前的結果畫面', async () => {
    t = await start();
    const tokB = await t.loginAs('S201');
    await t.teacher.open('Q1', 60);
    await t.submit(tokB, 'Q1', 'B 的答案');
    await t.teacher.close();
    await t.stop();

    t = await start();
    const view = await t.state(tokB);
    expect(view).toMatchObject({
      phase: 'CLOSED',
      question: { questionId: 'Q1' },
      myTeamOutcome: 'WIN',
      myTeamSubmission: { answer: 'B 的答案' },
      results: [{ rank: 1, teamName: '第 2 組', answer: 'B 的答案', isWinner: true }],
    });
  });

  it('活動結束後重啟：仍是 ENDED', async () => {
    t = await start();
    const tok = await t.loginAs('S201');
    await t.teacher.end();
    await t.stop();
    t = await start();
    expect((await t.state(tok)).phase).toBe('ENDED');
  });
});
