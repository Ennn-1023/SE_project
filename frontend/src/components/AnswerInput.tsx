import { useId, useState } from 'react';
import { MAX_ANSWER_LENGTH, countChars, validateAnswer } from '@buzzer/shared';
import { api, ApiError } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface Props {
  questionId: string;
  /** 斷線時停用送出（FR-005） */
  offline: boolean;
  /** 送出成功時（伺服器已接受） */
  onSubmitted(answer: string): void;
}

interface ShownError {
  message: string;
  hint: string;
}

/** 這些錯誤代表狀態已不允許送出：按鈕維持停用，等待伺服器推播新畫面（FR-014a） */
const LOCKING_CODES = new Set(['ALREADY_SUBMITTED', 'QUESTION_CLOSED', 'QUESTION_NOT_OPEN', 'ACTIVITY_ENDED', 'NO_TEAM']);

/** 作答區（FR-014、FR-014a）：一鍵送出、字數計數、處理中停用 */
export function AnswerInput({ questionId, offline, onSubmitted }: Props) {
  const inputId = useId();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ShownError | null>(null);
  const [locked, setLocked] = useState(false);

  const length = countChars(draft.trim());
  const check = validateAnswer(draft);
  const tooLong = !check.ok && check.code === 'ANSWER_TOO_LONG';
  const canSubmit = check.ok && !busy && !offline && !locked;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ answer: string }>('/api/student/submissions', {
        method: 'POST',
        body: { questionId, answer: draft },
      });
      onSubmitted(res.answer);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { message: e.message, hint: e.hint }
          : { message: '送出失敗', hint: '請稍後再試一次' },
      );
      if (e instanceof ApiError && LOCKING_CODES.has(e.code)) setLocked(true);
      setBusy(false);
    }
  };

  return (
    <form
      className="answer-form"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <div className="field">
        <label htmlFor={inputId}>你的答案</label>
        <textarea
          id={inputId}
          className="textarea"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={busy}
          aria-invalid={tooLong}
          aria-describedby={`${inputId}-count`}
        />
        <div className="answer-meta">
          <span id={`${inputId}-count`} className={tooLong ? 'text-danger' : 'muted'}>
            {length} / {MAX_ANSWER_LENGTH}
          </span>
          <span className="muted">送出後不可修改</span>
        </div>
        {tooLong && (
          <p className="text-danger">
            答案最多 {MAX_ANSWER_LENGTH} 字，目前 {length} 字，請精簡後再送出
          </p>
        )}
      </div>
      {/* 與 001 頁面相同的錯誤樣式（001 FR-003）：說明原因與修正方式 */}
      <ErrorMessage message={error?.message} hint={error?.hint} />
      <button type="submit" className="btn btn-accent btn-block" disabled={!canSubmit}>
        {busy ? '送出中…' : '送出答案'}
      </button>
    </form>
  );
}
