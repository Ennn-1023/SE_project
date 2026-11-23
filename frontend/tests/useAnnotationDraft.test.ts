/** US2：標註草稿的自動儲存（FR-021、research R5）。 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnnotatedQuestion } from '@buzzer/shared';
import { api, ApiError } from '../src/api/apiClient';
import { useAnnotationDraft } from '../src/questions/useAnnotationDraft';
import { draftView } from './questionFixtures';

const q = (key: string): AnnotatedQuestion => ({
  key,
  label: '',
  labelManual: false,
  kind: 'SINGLE',
  stemCell: null,
  parts: [{ questionCell: 'C5', answerCell: null }],
});

const saved = (revision: number) => ({
  revision,
  annotations: { questions: [] },
  validation: { issues: [], warnings: [], totalIssues: 0 },
  expiresAt: new Date().toISOString(),
});

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useAnnotationDraft', () => {
  it('800 ms 內多次變更只送一次 PUT，並帶最新內容與 revision（正常）', async () => {
    const save = vi
      .spyOn(api, 'saveAnnotations')
      .mockResolvedValueOnce(saved(1))
      .mockResolvedValueOnce(saved(2));
    const { result } = renderHook(() => useAnnotationDraft(draftView()));
    act(() => result.current.setDoc({ questions: [q('qa01')] }));
    act(() => result.current.setDoc({ questions: [q('qa01'), q('qa02')] }));
    expect(result.current.doc.questions.map((x) => x.label)).toEqual(['1', '2']);
    expect(result.current.saveState).toBe('pending');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(799);
    });
    expect(save).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![1]).toBe(0);
    expect(save.mock.calls[0]![2].questions).toHaveLength(2);
    expect(result.current.revision).toBe(1);
    expect(result.current.saveState).toBe('saved');
    act(() => result.current.setDoc({ questions: [q('qa01')] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(save.mock.calls[1]![1]).toBe(1);
  });

  it('revision 衝突時提示並可重新載入最新草稿', async () => {
    vi.spyOn(api, 'saveAnnotations').mockRejectedValue(
      new ApiError(
        409,
        'DRAFT_REVISION_CONFLICT',
        '此學習單已在其他視窗修改',
        undefined,
        '請重新載入以取得最新的標註',
      ),
    );
    const latest = draftView({
      revision: 5,
      annotations: { questions: [{ ...q('qa09'), label: '1' }] },
    });
    vi.spyOn(api, 'getCurrentDraft').mockResolvedValue({ draft: latest });
    const { result } = renderHook(() => useAnnotationDraft(draftView()));
    act(() => result.current.setDoc({ questions: [q('qa01')] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.conflict).toBe(true);
    expect(result.current.error?.message).toBe('此學習單已在其他視窗修改');
    await act(async () => {
      await result.current.reload();
    });
    expect(result.current.conflict).toBe(false);
    expect(result.current.revision).toBe(5);
    expect(result.current.doc.questions[0]!.key).toBe('qa09');
  });

  it('草稿過期時標示 expired（邊界）', async () => {
    vi.spyOn(api, 'saveAnnotations').mockRejectedValue(
      new ApiError(
        410,
        'DRAFT_EXPIRED',
        '標註進度已超過 30 分鐘未儲存而失效',
        undefined,
        '請重新讀取學習單',
      ),
    );
    const { result } = renderHook(() => useAnnotationDraft(draftView()));
    act(() => result.current.setDoc({ questions: [q('qa01')] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.expired).toBe(true);
  });

  it('網路錯誤時保留本地內容，flush 可重試', async () => {
    const save = vi
      .spyOn(api, 'saveAnnotations')
      .mockRejectedValueOnce(
        new ApiError(0, 'NETWORK_ERROR', '無法連線到伺服器', undefined, '請確認網路連線後再試一次'),
      )
      .mockResolvedValueOnce(saved(1));
    const { result } = renderHook(() => useAnnotationDraft(draftView()));
    act(() => result.current.setDoc({ questions: [q('qa01')] }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(result.current.saveState).toBe('error');
    expect(result.current.doc.questions).toHaveLength(1);
    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledTimes(2);
    expect(result.current.saveState).toBe('saved');
  });

  it('沒有未儲存的變更時 flush 直接成功、不呼叫 API', async () => {
    const save = vi.spyOn(api, 'saveAnnotations');
    const { result } = renderHook(() => useAnnotationDraft(draftView()));
    let ok = false;
    await act(async () => {
      ok = await result.current.flush();
    });
    expect(ok).toBe(true);
    expect(save).not.toHaveBeenCalled();
  });
});
