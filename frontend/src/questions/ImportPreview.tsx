import { useRef, useState } from 'react';
import type { QuestionSetView } from '@buzzer/shared';
import { api, ApiError, type PreviewResult } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { QuestionList } from './QuestionSetPanel';

export interface ImportPreviewProps {
  draftId: string;
  preview: QuestionSetView;
  replaces: PreviewResult['replaces'];
  onBack: () => void;
  onImported: (questionSet: QuestionSetView) => void;
}

/** ImportPreview（組件圖 003-component、FR-026／FR-027）：最終題目清單與確認匯入。 */
export function ImportPreview({
  draftId,
  preview,
  replaces,
  onBack,
  onImported,
}: ImportPreviewProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const sending = useRef(false);

  const confirm = async () => {
    if (sending.current) return; // 連按只送出一次（FR-030）
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      const { questionSet } = await api.confirmImport(draftId);
      onImported(questionSet);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="preview-heading"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-primary/40 bg-cream-100 p-4"
    >
      <h3 id="preview-heading" className="text-lg font-bold">
        預覽匯入
      </h3>
      <p className="break-all">
        {preview.source.spreadsheetTitle}／{preview.source.sheetTitle}
      </p>
      <p className="font-medium">
        共 {preview.questionCount} 題、{preview.slotCount} 個作答格
      </p>
      {replaces ? (
        <p className="rounded-md bg-accent/20 px-3 py-2">
          確認匯入後將取代目前的題目集（{replaces.spreadsheetTitle}／{replaces.sheetTitle}，
          {replaces.questionCount} 題）
        </p>
      ) : null}
      {preview.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1 text-sm">
          {preview.warnings.map((w, i) => (
            <li key={`${w.code}-${i}`}>
              提醒：{w.message}（{w.hint}）
            </li>
          ))}
        </ul>
      ) : null}
      <QuestionList questions={preview.questions} />
      <ErrorMessage message={error?.message} hint={error?.hint} />
      <div className="flex flex-wrap gap-2">
        <Button onClick={confirm} disabled={busy}>
          確認匯入
        </Button>
        <Button variant="ghost" onClick={onBack} disabled={busy}>
          返回修改
        </Button>
      </div>
    </section>
  );
}
