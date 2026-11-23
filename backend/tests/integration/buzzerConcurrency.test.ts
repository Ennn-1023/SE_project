import { afterEach, describe, expect, it } from 'vitest';
import { addTenTeams, startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
afterEach(async () => {
  await t.stop();
});

describe('多組同時送出（Q-T12、SC-003）', () => {
  it('10 組同時送出時 rank 為 1–10 且不重複', async () => {
    t = await startTestServer();
    const tokens = await addTenTeams(t);
    await t.teacher.open('Q1', 60);
    const results = await Promise.all(tokens.map((tok, i) => t.submit(tok, 'Q1', `答案 ${i + 1}`)));
    expect(results.every((r) => r.status === 201)).toBe(true);

    const ranks = t.server.ctx.submissions.all().map((s) => s.rank);
    expect(ranks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(new Set(t.server.ctx.submissions.all().map((s) => s.teamId)).size).toBe(10);
  });
});
