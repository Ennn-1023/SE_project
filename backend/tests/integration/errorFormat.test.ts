import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createLogger } from '../../src/lib/logger.js';
import { errorHandler } from '../../src/middleware/errorHandler.js';
import { createTestApp } from '../helpers/testApp.js';

describe('一致錯誤格式（FR-002）', () => {
  it('GET /api/health 回 200（正常）', async () => {
    const t = await createTestApp();
    const res = await t.request().get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });

  it('未預期錯誤回 500 固定訊息，不含堆疊與錯誤內容（邊界）', async () => {
    const lines: string[] = [];
    const app = express();
    app.get('/boom', () => {
      throw new Error('db password=hunter2 exploded');
    });
    app.use(errorHandler(createLogger({ sink: (l) => lines.push(l) })));
    const res = await request(app).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: { code: 'INTERNAL_ERROR', message: '系統發生錯誤，請稍後再試' },
    });
    expect(JSON.stringify(res.body)).not.toContain('hunter2');
    expect(res.text).not.toMatch(/at .*\.ts/);
    expect(lines).toHaveLength(1);
  });

  it('非 JSON 的 POST 回 415', async () => {
    const t = await createTestApp();
    const res = await t
      .request()
      .post('/api/auth/login')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('account=a&password=b');
    expect(res.status).toBe(415);
    expect(res.body.error.code).toBe('UNSUPPORTED_MEDIA');
    expect(res.body.error.hint).toBeTruthy();
  });

  it('格式錯誤的 JSON 回 400 VALIDATION_ERROR', async () => {
    const t = await createTestApp();
    const res = await t
      .request()
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"account":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('不存在的 /api 路徑回 404 一致格式', async () => {
    const t = await createTestApp();
    const res = await t.request().get('/api/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
