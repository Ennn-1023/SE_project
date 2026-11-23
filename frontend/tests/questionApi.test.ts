/** 003 題目匯入 API 方法（T020）。 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../src/api/apiClient';

afterEach(() => vi.unstubAllGlobals());

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('apiClient：題目匯入', () => {
  it('createDraft 以 JSON POST 連結並回傳草稿（正常）', async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ draft: { id: 'd1' } }, 201));
    vi.stubGlobal('fetch', fetchMock);
    const res = await api.createDraft('https://docs.google.com/spreadsheets/d/x');
    expect(res.draft.id).toBe('d1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/question-import/drafts');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({
      link: 'https://docs.google.com/spreadsheets/d/x',
    });
  });

  it('saveAnnotations 以 PUT 送出 revision 與標註；cancelDraft 以 DELETE 呼叫', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok({ revision: 2 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await api.saveAnnotations('d1', 1, { questions: [] });
    await api.cancelDraft('d1');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/question-import/drafts/d1/annotations');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('PUT');
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).method).toBe('DELETE');
  });

  it('ANNOTATION_INVALID 時拋出帶 details 的 ApiError（邊界）', async () => {
    const body = {
      error: {
        code: 'ANNOTATION_INVALID',
        message: '標註尚未完成或有錯誤（共 1 項）',
        hint: '請依清單逐項修正後再預覽',
        details: {
          issues: [{ code: 'MISSING_ANSWER_CELL', message: '第 4 題缺少作答格', hint: '請點選' }],
          totalIssues: 1,
        },
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(ok(body, 422)));
    const err = await api.previewImport('d1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 422, code: 'ANNOTATION_INVALID' });
    expect((err as ApiError).details?.totalIssues).toBe(1);
  });
});
