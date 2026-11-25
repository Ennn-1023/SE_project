import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  normalizeAnnotations,
  validateAnnotations,
  type Issue,
  type QuestionSetView,
  type SheetTab,
} from '@buzzer/shared';
import {
  api,
  ApiError,
  type GoogleStatus,
  type ImportDraftView,
  type PreviewResult,
} from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { TeacherLayout } from '../components/TeacherLayout';
import { AnnotationPanel, marksFor, useAnnotationEditor } from '../questions/AnnotationPanel';
import { GoogleConnectionPanel } from '../questions/GoogleConnectionPanel';
import { ImportPreview } from '../questions/ImportPreview';
import { QuestionSetPanel } from '../questions/QuestionSetPanel';
import { SheetGrid } from '../questions/SheetGrid';
import { SheetLinkForm } from '../questions/SheetLinkForm';
import { useAnnotationDraft, type SaveState } from '../questions/useAnnotationDraft';

/**
 * QuestionManagePage（組件圖 003-component、contracts/ui-routes.md）：題目管理——
 * Google 連結、讀取學習單、標註、預覽與匯入、目前題目集。
 */
export function QuestionManagePage() {
  const [google, setGoogle] = useState<GoogleStatus | null>(null);
  const [draft, setDraft] = useState<ImportDraftView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [tabChoices, setTabChoices] = useState<SheetTab[] | undefined>(undefined);
  const [link, setLink] = useState('');
  const [questionSet, setQuestionSet] = useState<QuestionSetView | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api
      .getQuestionSet()
      .then(({ questionSet: qs }) => {
        if (alive) setQuestionSet(qs);
      })
      .catch(() => undefined);
    api
      .getCurrentDraft()
      .then(({ draft: d }) => {
        if (alive && d) {
          setDraft(d);
          setLink(d.source.sourceUrl);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const onStatus = useCallback((s: GoogleStatus) => setGoogle(s), []);

  const onImported = (qs: QuestionSetView) => {
    setQuestionSet(qs);
    setDraft(null);
    setNotice(`已匯入 ${qs.questionCount} 題`);
  };

  /** 清除題目集（US5）；試算表上的標註保留。 */
  const clearSet = async () => {
    if (!window.confirm('確定要清除目前的題目集嗎？試算表上的標註會保留，之後匯入可帶回。')) return;
    setBusy(true);
    setError(null);
    try {
      await api.clearQuestionSet();
      setQuestionSet(null);
      setNotice(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
    } finally {
      setBusy(false);
    }
  };

  /** 重新讀取目前題目集的來源並帶回標註（US4）。 */
  const reimport = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const { draft: d } = await api.reimportQuestionSet();
      setDraft(d);
      setLink(d.source.sourceUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
    } finally {
      setBusy(false);
    }
  };

  const read = async (sourceLink: string, sheetId: number | undefined) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    setLink(sourceLink);
    try {
      const { draft: d } = await api.createDraft(sourceLink, sheetId);
      setDraft(d);
      setTabChoices(undefined);
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      setError(err);
      const sheets = err?.details?.sheets;
      if (err?.code === 'SHEET_TAB_NOT_FOUND' && Array.isArray(sheets)) {
        setTabChoices(sheets as SheetTab[]);
      }
    } finally {
      setBusy(false);
    }
  };

  const connected = !!google?.configured && !!google.connected;
  const sheets = tabChoices ?? (draft && draft.sheets.length > 1 ? draft.sheets : undefined);

  return (
    <TeacherLayout title="題目管理">
      <div className="flex min-w-0 flex-col gap-6">
        <GoogleConnectionPanel onStatus={onStatus} />

        <section
          aria-labelledby="import-heading"
          className="flex min-w-0 flex-col gap-3 rounded-xl border border-cream-300 bg-cream-100 p-4"
        >
          <h3 id="import-heading" className="text-lg font-bold">
            匯入學習單
          </h3>
          <SheetLinkForm
            disabled={!connected}
            busy={busy}
            sheets={sheets}
            selectedSheetId={tabChoices ? undefined : draft?.source.sheetId}
            initialLink={link}
            onSubmit={read}
          />
          <ErrorMessage message={error?.message} hint={error?.hint} />
        </section>

        {notice ? (
          <p role="status" className="rounded-md bg-cream-100 px-3 py-2 font-medium text-primary">
            {notice}
          </p>
        ) : null}

        {draft ? (
          <DraftWorkspace
            key={draft.id}
            draft={draft}
            onReplace={setDraft}
            onImported={onImported}
          />
        ) : null}

        <QuestionSetPanel
          questionSet={questionSet}
          actions={
            <>
              <Button variant="ghost" onClick={reimport} disabled={busy || !connected}>
                重新匯入
              </Button>
              <Button variant="ghost" onClick={clearSet} disabled={busy}>
                清除題目集
              </Button>
            </>
          }
        />
      </div>
    </TeacherLayout>
  );
}

/** 窄螢幕（< 640px，Tailwind sm 斷點以下）：標註面板為底部面板。 */
const NARROW_QUERY = '(max-width: 639.98px)';

function useNarrowScreen(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [narrow, setNarrow] = useState(() => supported && window.matchMedia(NARROW_QUERY).matches);
  useEffect(() => {
    if (!supported) return;
    const mql = window.matchMedia(NARROW_QUERY);
    const onChange = (e: { matches: boolean }) => setNarrow(e.matches);
    setNarrow(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [supported]);
  return narrow;
}

const SAVE_TEXT: Record<SaveState, string> = {
  idle: '',
  pending: '尚未儲存的變更…',
  saving: '儲存中…',
  saved: '已自動儲存',
  error: '儲存失敗',
};

/** 標註工作區：學習單格子＋標註面板（自動儲存）。 */
function DraftWorkspace({
  draft,
  onReplace,
  onImported,
}: {
  draft: ImportDraftView;
  onReplace: (d: ImportDraftView | null) => void;
  onImported: (qs: QuestionSetView) => void;
}) {
  const state = useAnnotationDraft(draft);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<ApiError | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const editor = useAnnotationEditor({ doc: state.doc, grid: draft.grid, onChange: state.setDoc });
  const [panelOpen, setPanelOpen] = useState(true);
  const narrow = useNarrowScreen();

  // 窄螢幕：開始點選格子的步驟時收合底部面板，讓格子不被遮住；步驟完成後再展開（手動驗證情境 13）
  const targetKey = editor.target
    ? `${editor.target.key}|${editor.target.part}|${editor.target.role}`
    : null;
  const previousTarget = useRef<string | null>(null);
  useEffect(() => {
    const previous = previousTarget.current;
    previousTarget.current = targetKey;
    if (!narrow) return;
    if (targetKey && !previous) setPanelOpen(false);
    else if (!targetKey && previous) setPanelOpen(true);
  }, [targetKey, narrow]);
  const validation = useMemo(
    () =>
      validateAnnotations(normalizeAnnotations(state.doc, draft.grid), draft.grid, {
        complete: false,
      }),
    [state.doc, draft.grid],
  );

  const reload = async () => {
    const d = await state.reload();
    onReplace(d);
  };

  const openPreview = async () => {
    setPreviewing(true);
    setPreviewError(null);
    try {
      if (!(await state.flush())) return;
      setPreview(await api.previewImport(draft.id));
    } catch (e) {
      setPreviewError(e instanceof ApiError ? e : null);
    } finally {
      setPreviewing(false);
    }
  };

  if (preview) {
    return (
      <ImportPreview
        draftId={draft.id}
        preview={preview.preview}
        replaces={preview.replaces}
        onBack={() => setPreview(null)}
        onImported={onImported}
      />
    );
  }

  const restoreWarnings = draft.validation.warnings.filter((w) => w.code.startsWith('RESTORED_'));
  const previewIssues = (previewError?.details?.issues as Issue[] | undefined) ?? [];
  const totalIssues = Number(previewError?.details?.totalIssues ?? previewIssues.length);

  return (
    <section aria-labelledby="draft-heading" className="flex min-w-0 flex-col gap-3 pb-40 sm:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="draft-heading" className="text-lg font-bold break-all">
          {draft.source.spreadsheetTitle}／{draft.source.sheetTitle}
        </h3>
        <span role="status" className="text-sm">
          {SAVE_TEXT[state.saveState]}
        </span>
      </div>
      {draft.restoredCount > 0 ? (
        <div role="status" className="rounded-md bg-cream-100 px-3 py-2">
          <p className="font-medium text-primary">已帶回上次的標註（{draft.restoredCount} 題）</p>
          {restoreWarnings.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {restoreWarnings.map((w, i) => (
                <li key={`${w.code}-${i}`}>
                  {w.message}（{w.hint}）
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {state.conflict || state.expired ? (
        <ErrorMessage message={state.error?.message} hint={state.error?.hint}>
          {state.conflict ? (
            <Button variant="ghost" onClick={reload}>
              重新載入
            </Button>
          ) : null}
        </ErrorMessage>
      ) : state.saveState === 'error' ? (
        <ErrorMessage message={state.error?.message ?? '儲存失敗'} hint={state.error?.hint}>
          <Button variant="ghost" onClick={() => void state.flush()}>
            重試
          </Button>
        </ErrorMessage>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={openPreview} disabled={previewing || state.conflict || state.expired}>
          預覽匯入
        </Button>
      </div>
      {previewError ? (
        <ErrorMessage message={previewError.message} hint={previewError.hint}>
          {previewIssues.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm text-ink">
              {previewIssues.map((i, n) => (
                <li key={`${i.code}-${n}`}>
                  {i.message}（{i.hint}）
                </li>
              ))}
              {totalIssues > previewIssues.length ? (
                <li>另有 {totalIssues - previewIssues.length} 項未列出</li>
              ) : null}
            </ul>
          ) : null}
        </ErrorMessage>
      ) : null}
      <div className="flex min-w-0 flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem]">
        <SheetGrid
          grid={draft.grid}
          onCellClick={editor.handleCellClick}
          marks={marksFor(state.doc, editor.currentKey)}
          selected={editor.selected}
        />
        <div
          data-testid="annotation-panel"
          className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-auto border-t border-cream-300 bg-cream-100 p-3 shadow-lg sm:static sm:z-auto sm:max-h-none sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none"
        >
          <div
            data-testid="annotation-bar"
            className="mb-2 flex flex-wrap items-center justify-between gap-2 sm:hidden"
          >
            <span className="min-w-0 flex-1 text-sm font-medium text-primary">
              {editor.stepText}
            </span>
            <div className="flex gap-2">
              {narrow ? (
                <Button
                  onClick={openPreview}
                  disabled={previewing || state.conflict || state.expired}
                >
                  預覽匯入
                </Button>
              ) : null}
              <Button variant="ghost" onClick={() => setPanelOpen((o) => !o)}>
                {panelOpen ? '收合' : '展開標註面板'}
              </Button>
            </div>
          </div>
          <div data-testid="annotation-panel-body" className={panelOpen ? '' : 'hidden sm:block'}>
            <AnnotationPanel
              doc={state.doc}
              grid={draft.grid}
              validation={validation}
              editor={editor}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
