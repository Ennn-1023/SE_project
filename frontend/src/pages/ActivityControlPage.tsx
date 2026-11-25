import { useState } from 'react';
import { phaseLabel, type ResultBoardView, type TeacherActivityView } from '@buzzer/shared';
import { api, ApiError } from '../api/apiClient';
import { ActivityQuestionList } from '../activity/ActivityQuestionList';
import { ActivityStartPanel } from '../activity/ActivityStartPanel';
import { ActivitySummary } from '../activity/ActivitySummary';
import { ExportCsvButton } from '../activity/ExportCsvButton';
import { WritebackPreviewDialog } from '../activity/WritebackPreviewDialog';
import { MonitorBoard } from '../activity/MonitorBoard';
import { OpenQuestionForm } from '../activity/OpenQuestionForm';
import { ResultBoard } from '../activity/ResultBoard';
import { useTeacherActivity, type TeacherSocketFactory } from '../activity/useTeacherActivity';
import { Button } from '../components/Button';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { ErrorMessage } from '../components/ErrorMessage';
import { Layout } from '../components/Layout';

export const OFFLINE_TEXT = '連線中斷，正在重新連線，請稍後再操作';
export const NO_RESULTS_TEXT = '尚無搶答活動結果可寫回或匯出';

function endConfirmText(view: TeacherActivityView): string {
  const notOpened = view.questions.filter((q) => q.status === 'NOT_OPENED').length;
  const answering = view.phase === 'ANSWERING';
  const parts = [
    answering ? '目前題目作答中，結束活動會先結束本題並保留已送出的答案。' : '',
    notOpened > 0 ? `尚有 ${notOpened} 題未開放，結束後無法再開放本場題目。` : '',
  ];
  return `${parts.join('')}確定結束活動？`;
}

/**
 * ActivityControlPage（004 contracts/ui-routes.md）：老師的搶答活動頁。
 * 依伺服器的活動階段切換主要區；手機單欄，桌機左側題目清單、右側主要區。
 */
export function ActivityControlPage({ socketFactory }: { socketFactory?: TeacherSocketFactory }) {
  const { state, run, clearError } = useTeacherActivity(socketFactory);
  const { view, connection, clockOffset, pending, error, loadError } = state;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<ResultBoardView | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [writebackOpen, setWritebackOpen] = useState(false);

  const offline = connection === 'offline';
  const busy = pending !== null || offline;

  if (!view) {
    return (
      <Layout title="搶答活動">
        {loadError ? (
          <ErrorMessage message={loadError.message} hint={loadError.hint} />
        ) : (
          <p role="status">載入中…</p>
        )}
      </Layout>
    );
  }

  const phase = view.phase;
  const selectable = phase === 'WAITING' || phase === 'CLOSED';
  const notOpened = view.questions.filter((q) => q.status === 'NOT_OPENED');
  const target =
    notOpened.find((q) => q.questionId === selectedId) ??
    notOpened.find((q) => q.questionId === view.preselectedQuestionId) ??
    null;

  const open = (questionId: string, seconds: number) =>
    void run('open', () => api.openQuestion(questionId, seconds)).then(
      (ok) => ok && setSelectedId(null),
    );
  const reopen = (questionId: string, seconds: number) =>
    void run('reopen', () => api.reopenQuestion(questionId, seconds)).then((ok) => {
      if (ok) setDialog(null);
    });

  const viewResult = async (questionId: string) => {
    setDialogError(null);
    try {
      setDialog(await api.getQuestionResult(questionId));
    } catch (e) {
      setDialogError(e instanceof ApiError ? e.message : '無法取得結果，請稍後再試');
    }
  };

  const dialogQuestion = dialog
    ? view.questions.find((q) => q.questionId === dialog.question.questionId)
    : undefined;

  return (
    <Layout title="搶答活動">
      <div className="flex flex-col gap-4">
        <div
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-cream-300 bg-cream-100 px-3 py-2"
          aria-label="活動狀態"
        >
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-bold" data-testid="phase">
              {phase === 'NONE' ? '尚未開始活動' : phaseLabel(phase)}
            </span>
            {phase !== 'NONE' ? (
              <span className="text-sm">
                已完成 {view.progress.closed}／{view.progress.total} 題
              </span>
            ) : null}
            <span className="text-sm text-ink/70">{offline ? '連線中斷' : '已連線'}</span>
          </div>
          {phase === 'WAITING' || phase === 'ANSWERING' || phase === 'CLOSED' ? (
            <Button
              variant="danger"
              disabled={busy}
              onClick={() => {
                if (window.confirm(endConfirmText(view))) void run('end', () => api.endActivity());
              }}
            >
              結束活動
            </Button>
          ) : null}
        </div>

        {/* 005：寫回與匯出入口（活動任何階段皆可使用，FR-002、FR-026） */}
        <div className="flex flex-wrap items-start gap-2" aria-label="寫回與匯出">
          <Button
            variant="primary"
            disabled={phase === 'NONE'}
            onClick={() => setWritebackOpen(true)}
          >
            寫回 Google 試算表
          </Button>
          <ExportCsvButton disabled={phase === 'NONE'} />
          {phase === 'NONE' ? (
            <p className="self-center text-sm text-ink/70">{NO_RESULTS_TEXT}</p>
          ) : null}
        </div>

        <ConnectionBanner status={connection} text={OFFLINE_TEXT} />
        {view.notice ? (
          <p role="status" className="rounded-lg border border-cream-300 bg-cream-100 px-3 py-2">
            {view.notice}
          </p>
        ) : null}
        {error ? (
          <ErrorMessage message={error.message} hint={error.hint}>
            <Button variant="ghost" className="mt-1" onClick={clearError}>
              知道了
            </Button>
          </ErrorMessage>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row-reverse lg:items-start">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            {phase === 'NONE' && view.readiness ? (
              <ActivityStartPanel
                readiness={view.readiness}
                restart={false}
                pending={pending !== null}
                disabled={offline}
                onStart={() => void run('start', () => api.startActivity())}
              />
            ) : null}

            {phase === 'ANSWERING' && view.current && view.monitor ? (
              <MonitorBoard
                question={view.current}
                monitor={view.monitor}
                endsAt={view.endsAt}
                clockOffset={clockOffset}
                pending={pending !== null}
                disabled={offline}
                onClose={() => void run('close', () => api.closeQuestion())}
              />
            ) : null}

            {phase === 'CLOSED' && view.result ? <ResultBoard result={view.result} /> : null}

            {selectable ? (
              target ? (
                <OpenQuestionForm
                  question={target}
                  pending={pending !== null}
                  disabled={offline}
                  onOpen={(s) => open(target.questionId, s)}
                  onReopen={(s) => reopen(target.questionId, s)}
                  onBackToWaiting={
                    phase === 'CLOSED'
                      ? () => void run('back', () => api.backToWaiting())
                      : undefined
                  }
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <p role="status" className="rounded-lg bg-cream-100 p-3 font-medium">
                    本場題目已全部完成，可結束活動
                  </p>
                  {phase === 'CLOSED' ? (
                    <Button
                      variant="ghost"
                      className="self-start"
                      disabled={busy}
                      onClick={() => void run('back', () => api.backToWaiting())}
                    >
                      回到等待畫面
                    </Button>
                  ) : null}
                </div>
              )
            ) : null}

            {phase === 'ENDED' ? (
              <>
                <ActivitySummary
                  view={view}
                  onViewResult={(id) => void viewResult(id)}
                  onWriteback={() => setWritebackOpen(true)}
                />
                {view.readiness ? (
                  <ActivityStartPanel
                    readiness={view.readiness}
                    restart
                    pending={pending !== null}
                    disabled={offline}
                    onStart={() => void run('start', () => api.startActivity())}
                  />
                ) : null}
              </>
            ) : null}
          </div>

          {phase !== 'NONE' && phase !== 'ENDED' ? (
            <aside className="w-full lg:w-80 lg:shrink-0">
              <ActivityQuestionList
                questions={view.questions}
                progress={view.progress}
                selectedId={target?.questionId ?? null}
                selectable={selectable}
                onSelect={setSelectedId}
                onViewResult={(id) => void viewResult(id)}
              />
            </aside>
          ) : null}
        </div>

        {dialogError ? <ErrorMessage message={dialogError} /> : null}
        {writebackOpen ? <WritebackPreviewDialog onClose={() => setWritebackOpen(false)} /> : null}
        {dialog ? (
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`第 ${dialog.question.label} 題結果`}
            className="fixed inset-0 z-10 flex items-start justify-center overflow-y-auto bg-ink/40 p-4"
          >
            <div className="flex w-full max-w-2xl flex-col gap-4 rounded-xl bg-cream-50 p-4">
              <ResultBoard result={dialog} />
              {selectable && dialogQuestion && dialogQuestion.status === 'CLOSED' ? (
                <OpenQuestionForm
                  question={dialogQuestion}
                  pending={pending !== null}
                  disabled={offline}
                  onOpen={() => undefined}
                  onReopen={(s) => reopen(dialogQuestion.questionId, s)}
                />
              ) : null}
              <Button variant="ghost" className="self-end" onClick={() => setDialog(null)}>
                關閉
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
