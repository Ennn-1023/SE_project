/** SC-009／憲章原則 III：token、授權碼、client secret、加密金鑰不得出現在回應、log 或資料庫明文中。 */
import { describe, expect, it } from 'vitest';
import type { Response } from 'supertest';
import { FakeGoogle } from '../helpers/fakeGoogle.js';
import { singleAnnotations } from '../helpers/annotations.js';
import { createTestApp, loginTeacher, TEST_GOOGLE_CONFIG } from '../helpers/testApp.js';
import { createLogger } from '../../src/lib/logger.js';
import { SINGLE_URL, singleSheet } from '../fixtures/google/single-sheet.js';

describe('機敏資料不外洩', () => {
  it('完整流程（含錯誤與 token 更新）的回應與 log 都不含任何 token 或憑證', async () => {
    const logLines: string[] = [];
    const google = new FakeGoogle().addSpreadsheet(singleSheet());
    const t = await createTestApp({
      google,
      logger: createLogger({ sink: (line) => logLines.push(line) }),
    });
    const agent = await loginTeacher(t);
    const responses: Response[] = [];
    const keep = (r: Response) => {
      responses.push(r);
      return r;
    };

    // 連結（含一次失敗的授權碼交換，觸發 warn log）
    google.failExchange = true;
    let start = keep(await agent.post('/api/google/oauth/start'));
    keep(await agent.get('/api/google/oauth/callback').query(google.consent(start.body.authUrl)));
    google.failExchange = false;
    start = keep(await agent.post('/api/google/oauth/start'));
    keep(await agent.get('/api/google/oauth/callback').query(google.consent(start.body.authUrl)));
    keep(await agent.get('/api/google/status'));

    // 讀取：一次 Google 錯誤、一次 token 更新
    google.failNext(500, 'INTERNAL', 'getSpreadsheet');
    keep(await agent.post('/api/question-import/drafts').send({ link: SINGLE_URL }));
    t.clock.advance(3600_000 - 10_000);
    const created = keep(
      await agent.post('/api/question-import/drafts').send({ link: SINGLE_URL }),
    );
    const id = created.body.draft.id;
    keep(
      await agent
        .put(`/api/question-import/drafts/${id}/annotations`)
        .send({ revision: 0, annotations: { questions: singleAnnotations() } }),
    );
    keep(await agent.post(`/api/question-import/drafts/${id}/preview`));
    keep(await agent.post(`/api/question-import/drafts/${id}/confirm`));
    keep(await agent.get('/api/question-set'));

    // 中斷（撤銷失敗，觸發 warn log）
    google.revokeFails = true;
    keep(await agent.delete('/api/google/connection'));

    expect(google.issuedSecrets.length).toBeGreaterThanOrEqual(4);
    const secrets = [
      ...google.issuedSecrets,
      TEST_GOOGLE_CONFIG.clientSecret,
      TEST_GOOGLE_CONFIG.encryptionKey.toString('base64'),
    ];
    const responseText = responses.map((r) => `${r.headers.location ?? ''}\n${r.text}`).join('\n');
    const logText = logLines.join('\n');
    expect(logLines.length).toBeGreaterThan(0);
    for (const s of secrets) {
      expect(responseText, '回應含有機敏資料').not.toContain(s);
      expect(logText, 'log 含有機敏資料').not.toContain(s);
    }
    // 資料庫中的 token 只以密文保存
    const dump = JSON.stringify([
      t.db.prepare('SELECT * FROM google_connections').all(),
      t.db.prepare('SELECT * FROM oauth_states').all(),
      t.db.prepare('SELECT * FROM question_events').all(),
    ]);
    for (const s of google.issuedSecrets) expect(dump).not.toContain(s);
  });
});
