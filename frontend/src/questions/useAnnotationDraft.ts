/**
 * 標註草稿的狀態與自動儲存（plan.md 基礎設施允許清單、research R5）：
 * 變更後 800 ms 防抖以 PUT 儲存整份標註；revision 衝突與過期時提示。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { autoNumber, type AnnotationDocument } from '@buzzer/shared';
import { api, ApiError, type ImportDraftView } from '../api/apiClient';

export const SAVE_DEBOUNCE_MS = 800;

export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AnnotationDraftState {
  doc: AnnotationDocument;
  revision: number;
  saveState: SaveState;
  error: ApiError | null;
  /** 另一個視窗已修改（DRAFT_REVISION_CONFLICT） */
  conflict: boolean;
  /** 草稿已過期（DRAFT_EXPIRED） */
  expired: boolean;
  setDoc: (next: AnnotationDocument) => void;
  /** 立即儲存尚未送出的變更；成功（或沒有變更）回傳 true。 */
  flush: () => Promise<boolean>;
  /** 重新取得伺服器上的最新草稿。 */
  reload: () => Promise<ImportDraftView | null>;
}

export function useAnnotationDraft(draft: ImportDraftView | null): AnnotationDraftState {
  const [doc, setDocState] = useState<AnnotationDocument>(draft?.annotations ?? { questions: [] });
  const [revision, setRevision] = useState(draft?.revision ?? 0);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [error, setError] = useState<ApiError | null>(null);
  const [conflict, setConflict] = useState(false);
  const [expired, setExpired] = useState(false);

  const draftId = useRef(draft?.id ?? null);
  const latest = useRef({ doc, revision, dirty: false });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback((d: ImportDraftView | null) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    draftId.current = d?.id ?? null;
    const nextDoc = d?.annotations ?? { questions: [] };
    latest.current = { doc: nextDoc, revision: d?.revision ?? 0, dirty: false };
    setDocState(nextDoc);
    setRevision(d?.revision ?? 0);
    setSaveState('idle');
    setError(null);
    setConflict(false);
    setExpired(false);
  }, []);

  // 換了一份草稿（重新讀取學習單）時重設
  useEffect(() => {
    if ((draft?.id ?? null) !== draftId.current) reset(draft);
  }, [draft, reset]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const save = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const id = draftId.current;
    if (!id || !latest.current.dirty) return true;
    const { doc: sending, revision: rev } = latest.current;
    setSaveState('saving');
    try {
      const res = await api.saveAnnotations(id, rev, sending);
      latest.current.revision = res.revision;
      // 送出期間若又有變更，保持 dirty 以便下次儲存
      latest.current.dirty = latest.current.doc !== sending;
      setRevision(res.revision);
      setError(null);
      setSaveState(latest.current.dirty ? 'pending' : 'saved');
      return true;
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError(err);
      setSaveState('error');
      if (err?.code === 'DRAFT_REVISION_CONFLICT') setConflict(true);
      if (err?.code === 'DRAFT_EXPIRED') setExpired(true);
      return false;
    }
  }, []);

  const setDoc = useCallback(
    (next: AnnotationDocument) => {
      const numbered = autoNumber(next);
      latest.current = { ...latest.current, doc: numbered, dirty: true };
      setDocState(numbered);
      setSaveState('pending');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void save();
      }, SAVE_DEBOUNCE_MS);
    },
    [save],
  );

  const reload = useCallback(async () => {
    const { draft: d } = await api.getCurrentDraft();
    reset(d);
    return d;
  }, [reset]);

  return { doc, revision, saveState, error, conflict, expired, setDoc, flush: save, reload };
}
