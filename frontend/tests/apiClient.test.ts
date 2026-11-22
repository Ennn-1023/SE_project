import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError, NETWORK_ERROR, tokenStore } from '../src/api/client';

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('帶上 Bearer token 並回傳 JSON', async () => {
    tokenStore.set('tok-123');
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(api('/api/student/state')).resolves.toEqual({ ok: 1 });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer tok-123' });
  });

  it('伺服器錯誤時拋出含 code、message、hint 的 ApiError', async () => {
    const body = { error: { code: 'EMPTY_ANSWER', field: 'answer', message: '答案不可為空', hint: '請輸入內容後再送出' } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })));
    const err = await api('/x', { body: { answer: '' } }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, code: 'EMPTY_ANSWER', field: 'answer', message: '答案不可為空', hint: '請輸入內容後再送出' });
  });

  it('網路錯誤時拋出 NETWORK_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(api('/x')).rejects.toMatchObject({ code: NETWORK_ERROR, status: 0 });
  });
});
