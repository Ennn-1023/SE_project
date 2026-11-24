import { useCallback, useEffect, useState } from 'react';
import { phaseLabel, type TeacherStatus } from '@buzzer/shared';
import { api, ApiError } from '../api/client';
import { ErrorMessage } from '../components/ErrorMessage';

interface QuestionItem {
  questionId: string;
  number: number;
  text: string;
}

type Status = TeacherStatus & { questions?: QuestionItem[] };

const MIN = 5;
const MAX = 600;

/** dev 專用：模擬老師操作面板（US6、FR-022） */
export function DevTeacherPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [questions, setQuestions] = useState<QuestionItem[]>([]);
  const [questionId, setQuestionId] = useState('');
  const [seconds, setSeconds] = useState('60');
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const s = await api<Status>('/api/dev/teacher/status');
      setStatus(s);
      setQuestions(s.questions ?? []);
      setQuestionId((cur) => cur || s.questions?.[0]?.questionId || '');
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const secondsNum = Number(seconds);
  const secondsValid = /^\d+$/.test(seconds) && secondsNum >= MIN && secondsNum <= MAX;

  const run = async (path: string, body?: unknown) => {
    setBusy(true);
    setError(null);
    try {
      const s = await api<TeacherStatus>(`/api/dev/teacher/${path}`, { method: 'POST', body: body ?? {} });
      setStatus((prev) => ({ ...prev, ...s }));
    } catch (e) {
      if (e instanceof ApiError) setError(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card dev-panel" aria-labelledby="dev-teacher-title">
      <h2 id="dev-teacher-title">模擬老師操作</h2>
      {status && (
        <dl className="dev-status">
          <dt>目前階段</dt>
          <dd>
            <strong>{phaseLabel(status.phase)}</strong>
          </dd>
          <dt>題目</dt>
          <dd>目前題目：{status.currentQuestionId ?? '—'}</dd>
          <dt>結束時間</dt>
          <dd>{status.endsAt ? new Date(status.endsAt).toLocaleTimeString() : '—'}</dd>
        </dl>
      )}

      <div className="dev-open">
        <div className="field">
          <label htmlFor="dev-question">題目</label>
          <select
            id="dev-question"
            className="select"
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
          >
            {questions.map((q) => (
              <option key={q.questionId} value={q.questionId}>
                {q.questionId}：{q.text}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="dev-seconds">作答秒數</label>
          <input
            id="dev-seconds"
            className="input"
            type="number"
            inputMode="numeric"
            min={MIN}
            max={MAX}
            value={seconds}
            onChange={(e) => setSeconds(e.target.value)}
            aria-invalid={!secondsValid}
          />
          {!secondsValid && <p className="text-danger">作答秒數必須是 5–600 的整數</p>}
        </div>
        <button
          type="button"
          className="btn btn-accent btn-block"
          disabled={busy || !questionId || !secondsValid}
          onClick={() => void run('open', { questionId, seconds: secondsNum })}
        >
          開放題目
        </button>
      </div>

      <div className="dev-actions">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run('time-up')}>
          時間到
        </button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run('close')}>
          手動結束
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => void run('back-to-waiting')}
        >
          回到等待畫面
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void run('end')}>
          結束活動
        </button>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void run('reset')}>
          重設
        </button>
        {/* 004：啟動時不再自動建立 mock 活動，改由此按鈕建立（FR-032） */}
        <button
          type="button"
          className="btn btn-outline"
          disabled={busy}
          onClick={() => void run('mock-activity').then(load)}
        >
          以 mock 題目開始活動
        </button>
      </div>

      {/* 與 001 頁面相同的錯誤樣式（001 FR-003）：說明原因與修正方式 */}
      <ErrorMessage message={error?.message} hint={error?.hint} />
    </section>
  );
}
