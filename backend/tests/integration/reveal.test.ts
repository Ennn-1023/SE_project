import { afterEach, describe, expect, it } from 'vitest';
import type { QuestionResultDto, StudentView } from '@buzzer/shared';
import { addTenTeams, startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
afterEach(async () => {
  await t.stop();
});

const closed = (v: StudentView) => v.phase === 'CLOSED';

describe('搶答結束後揭曉結果（US2、Q-T2、Q-T3）', () => {
  it('B、A、C 依序送出後手動結束：依順位揭曉，只有 B 成功，未送出的組為 NOT_SUBMITTED', async () => {
    t = await startTestServer();
    const [tokA, tokB, tokC, tokD] = await Promise.all(['S101', 'S201', 'S301', 'S401'].map((s) => t.loginAs(s)));
    const [a, b, c, d] = await Promise.all([tokA!, tokB!, tokC!, tokD!].map((tok) => t.connect(tok)));

    await t.teacher.open('Q1', 60);
    expect((await t.submit(tokB!, 'Q1', 'B 的答案')).status).toBe(201);
    expect((await t.submit(tokA!, 'Q1', 'A 的答案')).status).toBe(201);
    expect((await t.submit(tokC!, 'Q1', 'C 的答案')).status).toBe(201);
    expect((await t.teacher.close()).status).toBe(200);

    const [va, vb, vc, vd] = await Promise.all([a!, b!, c!, d!].map((cl) => cl.waitFor(closed)));
    const expected = [
      { rank: 1, teamName: '第 2 組', answer: 'B 的答案', isWinner: true },
      { rank: 2, teamName: '第 1 組', answer: 'A 的答案', isWinner: false },
      { rank: 3, teamName: '第 3 組', answer: 'C 的答案', isWinner: false },
    ];
    for (const v of [va, vb, vc, vd]) expect(v!.results).toEqual(expected);
    expect(vb!.myTeamOutcome).toBe('WIN');
    expect(va!.myTeamOutcome).toBe('LOSE');
    expect(vc!.myTeamOutcome).toBe('LOSE');
    expect(vd!.myTeamOutcome).toBe('NOT_SUBMITTED');
    expect(vd!.myTeamSubmission).toBeNull();

    // 結果不含送出時間與送出者（釐清 Q4）
    const json = JSON.stringify(va);
    for (const leak of ['S201', 'S101', 'receivedAt', 'received_at', 'submitted_at', 'studentId']) {
      expect(json).not.toContain(leak);
    }

    // 重新取回狀態也一樣
    expect((await t.state(tokD!)).results).toEqual(expected);
  });

  it('產生一筆完整結果資料，並保存所有送出紀錄（Q-T3、FR-019、FR-020）', async () => {
    t = await startTestServer();
    const tokB = await t.loginAs('S201');
    const tokA = await t.loginAs('S101');
    await t.teacher.open('Q1', 60);
    await t.submit(tokB, 'Q1', 'SYN → SYN-ACK → ACK');
    await t.submit(tokA, 'Q1', '三次握手');
    await t.teacher.timeUp();

    const results = (await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie)).body as QuestionResultDto[];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ question_id: 'Q1', answer: 'SYN → SYN-ACK → ACK', winner_team: 'T2' });
    expect(new Date(results[0]!.submitted_at!).toISOString()).toBe(results[0]!.submitted_at);

    const subs = await t.http.get('/api/dev/submissions').set('Cookie', t.teacherCookie).query({ questionId: 'Q1' });
    expect(subs.status).toBe(200);
    expect(subs.body.map((s: { team_id: string; rank: number }) => [s.team_id, s.rank])).toEqual([
      ['T2', 1],
      ['T1', 2],
    ]);
    expect(subs.body[0]).toMatchObject({ student_id: 'S201', answer: 'SYN → SYN-ACK → ACK' });
  });

  it('沒有任何組別送出時，結果為 null，學生看到空結果', async () => {
    t = await startTestServer();
    const tok = await t.loginAs('S101');
    const cl = await t.connect(tok);
    await t.teacher.open('Q2', 5);
    await t.teacher.timeUp();
    const v = await cl.waitFor(closed);
    expect(v.results).toEqual([]);
    expect(v.myTeamOutcome).toBe('NOT_SUBMITTED');
    const results = (await t.http.get('/api/dev/results').set('Cookie', t.teacherCookie)).body as QuestionResultDto[];
    expect(results).toEqual([{ question_id: 'Q2', answer: null, winner_team: null, submitted_at: null }]);
  });

  it('10 組同時送出並結束：恰好 1 組 WIN，results 恰好 1 筆 isWinner（SC-003）', async () => {
    t = await startTestServer();
    const tokens = await addTenTeams(t);
    await t.teacher.open('Q1', 60);
    await Promise.all(tokens.map((tok, i) => t.submit(tok, 'Q1', `答案 ${i + 1}`)));
    await t.teacher.close();
    const views = await Promise.all(tokens.map((tok) => t.state(tok)));
    expect(views.filter((v) => v.myTeamOutcome === 'WIN')).toHaveLength(1);
    expect(views[0]!.results!.filter((r) => r.isWinner)).toHaveLength(1);
    expect(views[0]!.results!.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('/api/dev/submissions 缺少 questionId 回 400', async () => {
    t = await startTestServer();
    const res = await t.http.get('/api/dev/submissions').set('Cookie', t.teacherCookie);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: 'VALIDATION_ERROR', field: 'questionId' });
  });
});
