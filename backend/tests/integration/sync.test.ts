import { afterEach, describe, expect, it } from 'vitest';
import { addTenTeams, startTestServer, type TestServer } from '../helpers/testServer';

let t: TestServer;
afterEach(async () => {
  await t.stop();
});

describe('階段同步（SC-001、SC-002）', () => {
  it('10 個連線在階段變化後 1 秒內都收到 state:update，而且 endsAt 完全相同', async () => {
    t = await startTestServer();
    const tokens = await addTenTeams(t);
    const clients = await Promise.all(tokens.map((tok) => t.connect(tok)));

    const started = Date.now();
    const arrivals = clients.map((c) =>
      c.waitFor((v) => v.phase === 'ANSWERING').then((v) => ({ v, at: Date.now() })),
    );
    await t.teacher.open('Q1', 60);
    const got = await Promise.all(arrivals);

    for (const { at } of got) expect(at - started).toBeLessThan(1000);
    const endsAts = new Set(got.map(({ v }) => v.endsAt));
    expect(endsAts.size).toBe(1);

    const closeStarted = Date.now();
    const closed = clients.map((c) => c.waitFor((v) => v.phase === 'CLOSED').then(() => Date.now()));
    await t.teacher.close();
    for (const at of await Promise.all(closed)) expect(at - closeStarted).toBeLessThan(1000);
  });
});
