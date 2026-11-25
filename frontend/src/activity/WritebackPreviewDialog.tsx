import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import type {
  OverwriteMode,
  SkipReason,
  WritebackItemView,
  WritebackOutcomeView,
  WritebackPreviewView,
} from '@buzzer/shared';
import { api, ApiError } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { WritebackResultPanel } from './WritebackResultPanel';

const SKIP_TEXT: Record<SkipReason, string> = {
  NO_WINNER: '無組別送出，不寫入',
  NOT_OPENED: '未開放，不寫入',
  ANSWERING: '作答中，結束後才可寫回',
};

const STATUS_BADGE: Record<WritebackItemView['status'], string> = {
  EMPTY: '空白，將寫入',
  OVERWRITE: '已有內容，將覆蓋',
  SAME_CONTENT: '已是相同內容，不需寫入',
  ANNOTATION_MISSING: '找不到作答格標註',
  ANNOTATION_DUPLICATED: '作答格標註重複',
};

/** 需要重新連結 Google 的錯誤 */
const GOOGLE_LINK_CODES = new Set(['GOOGLE_NOT_CONNECTED', 'GOOGLE_AUTH_EXPIRED']);
/** 需要重新預覽的錯誤 */
const REPREVIEW_CODES = new Set(['WRITEBACK_STALE', 'WRITEBACK_PREVIEW_EXPIRED']);

type Phase = 'loading' | 'error' | 'preview' | 'writing' | 'done';

interface Props {
  onClose: () => void;
}

const isOverwrite = (i: WritebackItemView) =>
  i.currentContent.trim() !== '' && i.currentContent.trim() !== i.answer.trim();

/** 答案、組名與試算表內容一律以純文字呈現並保留換行（FR-027） */
function PlainText({ text, empty = '（空白）' }: { text: string; empty?: string }) {
  return <span className="whitespace-pre-wrap break-words">{text === '' ? empty : text}</span>;
}

function ItemCard({
  item,
  checked,
  onToggle,
  disabled,
}: {
  item: WritebackItemView;
  checked: boolean;
  onToggle: (key: string) => void;
  disabled: boolean;
}) {
  const title = `第 ${item.questionNumber} 題${item.partLabel ?? ''}`;
  const highlight =
    item.status === 'OVERWRITE' ||
    (item.status === 'ANNOTATION_MISSING' && checked && isOverwrite(item));
  return (
    <li
      className={`flex min-w-0 flex-col gap-1 rounded-lg border-2 bg-cream-100 p-3 ${
        highlight ? 'border-accent' : 'border-cream-300'
      }`}
      data-status={item.status}
      aria-label={title}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold">{title}</span>
        <span
          className={`rounded-full px-2 py-0.5 text-sm ${
            item.status === 'OVERWRITE' ? 'bg-accent text-ink' : 'bg-cream-300 text-ink'
          }`}
        >
          {STATUS_BADGE[item.status]}
        </span>
      </div>
      {item.status === 'ANNOTATION_DUPLICATED' ? (
        <p className="break-words text-sm">
          作答格標註重複，無法判斷位置，將略過；請重新匯入學習單修正標註
        </p>
      ) : null}
      {item.status === 'ANNOTATION_MISSING' ? (
        <>
          <p className="break-words text-sm">
            找不到作答格標註（匯入時位置：{item.fallbackCell ?? '無紀錄'}，目前內容：
            <PlainText text={item.currentContent} />）
          </p>
          {item.fallbackCell ? (
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                className="h-5 w-5"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(item.key)}
              />
              寫入匯入時的位置
            </label>
          ) : null}
        </>
      ) : null}
      {item.cell ? (
        <p className="text-sm">
          作答格 {item.cell}
          {item.hidden ? '（此格目前被隱藏）' : ''}
        </p>
      ) : null}
      <p className="text-sm">
        搶答成功：
        <PlainText text={item.winnerTeamName} />
      </p>
      <p className="min-w-0">
        <span className="text-sm text-ink/70">將寫入：</span>
        <PlainText text={item.answer} />
      </p>
      {item.status !== 'ANNOTATION_MISSING' && item.status !== 'ANNOTATION_DUPLICATED' ? (
        <p className="min-w-0">
          <span className="text-sm text-ink/70">目前內容：</span>
          <PlainText text={item.currentContent} />
        </p>
      ) : null}
    </li>
  );
}

/**
 * WritebackPreviewDialog（005 組件圖、contracts/ui-routes.md、diagrams/005-sequence-writeback.puml）：
 * 預覽 → 覆蓋選項 → 確認寫回 → 結果。手機全螢幕、桌機置中；內容垂直捲動，無水平捲動。
 */
export function WritebackPreviewDialog({ onClose }: Props) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [preview, setPreview] = useState<WritebackPreviewView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [mode, setMode] = useState<OverwriteMode | null>(null);
  const [fallbackKeys, setFallbackKeys] = useState<Set<string>>(new Set());
  const [outcome, setOutcome] = useState<WritebackOutcomeView | null>(null);

  const toApiError = (e: unknown) =>
    e instanceof ApiError ? e : new ApiError(0, 'UNKNOWN_ERROR', '系統發生錯誤，請稍後再試');

  const load = useCallback(async () => {
    setPhase('loading');
    setError(null);
    setMode(null);
    setFallbackKeys(new Set());
    try {
      setPreview(await api.writebackPreview());
      setPhase('preview');
    } catch (e) {
      setPreview(null);
      setError(toApiError(e));
      setPhase('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const needsMode =
    !!preview &&
    preview.items.some(
      (i) =>
        i.status === 'OVERWRITE' ||
        (i.status === 'ANNOTATION_MISSING' && fallbackKeys.has(i.key) && isOverwrite(i)),
    );

  const confirm = async () => {
    if (!preview) return;
    setPhase('writing');
    setError(null);
    try {
      const result = await api.writebackConfirm({
        previewId: preview.previewId,
        ...(mode ? { mode } : {}),
        ...(fallbackKeys.size > 0 ? { fallbackKeys: [...fallbackKeys] } : {}),
      });
      setOutcome(result);
      setPhase('done');
    } catch (e) {
      const err = toApiError(e);
      setError(err);
      setPhase(REPREVIEW_CODES.has(err.code) ? 'error' : 'preview');
    }
  };

  const toggle = (key: string) =>
    setFallbackKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const writing = phase === 'writing';
  const details = error?.details as { spreadsheetTitle?: string; url?: string } | undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="寫回 Google 試算表"
      className="fixed inset-0 z-20 flex bg-ink/40 sm:items-center sm:justify-center sm:p-4"
    >
      <div className="flex h-full w-full min-w-0 flex-col bg-cream-50 sm:h-auto sm:max-h-[90vh] sm:max-w-[960px] sm:rounded-xl">
        <h2 className="border-b border-cream-300 px-4 py-3 text-lg font-bold">
          寫回 Google 試算表
        </h2>
        <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4">
          {phase === 'loading' ? <p role="status">正在讀取學習單…</p> : null}

          {phase === 'error' && error ? (
            <ErrorMessage message={error.message} hint={error.hint}>
              {GOOGLE_LINK_CODES.has(error.code) ? (
                <Link
                  to="/teacher/questions"
                  className="mt-2 inline-flex min-h-11 items-center text-primary underline"
                >
                  前往連結 Google 帳號
                </Link>
              ) : null}
              {error.code === 'WRITEBACK_NOT_THIS_SHEET' && details?.url ? (
                <a
                  href={details.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex min-h-11 items-center break-all text-primary underline"
                >
                  本場活動的學習單：{details.spreadsheetTitle ?? '開啟試算表'}
                </a>
              ) : null}
              {REPREVIEW_CODES.has(error.code) ? (
                <Button variant="ghost" className="mt-2" onClick={() => void load()}>
                  重新預覽
                </Button>
              ) : null}
            </ErrorMessage>
          ) : null}

          {phase === 'done' && outcome ? (
            <WritebackResultPanel outcome={outcome} onClose={onClose} />
          ) : null}

          {(phase === 'preview' || phase === 'writing') && preview ? (
            <>
              <p className="break-words">
                目標：
                <a
                  href={preview.target.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  <PlainText
                    text={`${preview.target.spreadsheetTitle}／${preview.target.sheetTitle}`}
                  />
                </a>
              </p>
              <p
                className="rounded-lg bg-cream-100 p-3 font-medium"
                data-testid="writeback-summary"
              >
                {preview.summary.emptyCount} 格將寫入空白格、{preview.summary.overwriteCount}{' '}
                格將覆蓋既有內容、{preview.summary.sameCount} 格已是相同內容、
                {preview.summary.unresolvedCount} 格無法定位
              </p>
              {error ? (
                <ErrorMessage message={error.message} hint={error.hint ?? '試算表未被修改'} />
              ) : null}
              <ul className="flex flex-col gap-2" aria-label="寫回項目">
                {preview.items.map((item) => (
                  <ItemCard
                    key={item.key}
                    item={item}
                    checked={fallbackKeys.has(item.key)}
                    onToggle={toggle}
                    disabled={writing}
                  />
                ))}
              </ul>
              {preview.skipped.length > 0 ? (
                <section aria-label="不寫入的題目">
                  <h3 className="font-bold">不寫入的題目</h3>
                  <ul className="list-disc pl-5">
                    {preview.skipped.map((q) => (
                      <li key={q.questionNumber}>
                        第 {q.questionNumber} 題：{SKIP_TEXT[q.reason]}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {needsMode ? (
                <fieldset className="flex flex-col gap-1 rounded-lg border-2 border-accent p-3">
                  <legend className="px-1 font-bold">有作答格已有內容，請選擇：</legend>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="overwrite-mode"
                      className="h-5 w-5"
                      checked={mode === 'OVERWRITE_ALL'}
                      disabled={writing}
                      onChange={() => setMode('OVERWRITE_ALL')}
                    />
                    全部覆蓋
                  </label>
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="radio"
                      name="overwrite-mode"
                      className="h-5 w-5"
                      checked={mode === 'SKIP_NON_EMPTY'}
                      disabled={writing}
                      onChange={() => setMode('SKIP_NON_EMPTY')}
                    />
                    略過已有內容的格子，只寫入空白格
                  </label>
                </fieldset>
              ) : null}
            </>
          ) : null}
        </div>
        {phase !== 'done' ? (
          <div className="flex flex-wrap justify-end gap-2 border-t border-cream-300 px-4 py-3">
            <Button variant="ghost" disabled={writing} onClick={onClose}>
              {phase === 'error' ? '關閉' : '取消'}
            </Button>
            {phase === 'preview' || phase === 'writing' ? (
              <Button
                variant="secondary"
                disabled={writing || (needsMode && !mode)}
                onClick={() => void confirm()}
              >
                {writing ? '寫回中…' : '確認寫回'}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
