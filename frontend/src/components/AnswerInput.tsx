import { useId, useState } from 'react';
import {
  MAX_ANSWER_LENGTH,
  countChars,
  validateAnswer,
  validatePartAnswers,
  type PartAnswer,
  type QuestionPartView,
} from '@buzzer/shared';
import { api, ApiError } from '../api/client';
import { ErrorMessage } from './ErrorMessage';

interface Props {
  questionId: string;
  /** 斷線時停用送出（FR-005） */
  offline: boolean;
  /** 送出成功時（伺服器已接受） */
  onSubmitted(answer: string, answers?: PartAnswer[]): void;
  /** 題組的小題（004 FR-030a）：每小題一個作答框，整題一次送出 */
  parts?: QuestionPartView[];
}

interface ShownError {
  message: string;
  hint: string;
}

/** 這些錯誤代表狀態已不允許送出：按鈕維持停用，等待伺服器推播新畫面（FR-014a） */
const LOCKING_CODES = new Set(['ALREADY_SUBMITTED', 'QUESTION_CLOSED', 'QUESTION_NOT_OPEN', 'ACTIVITY_ENDED', 'NO_TEAM']);

/** 作答區（FR-014、FR-014a）：一鍵送出、字數計數、處理中停用 */
export function AnswerInput({ questionId, offline, onSubmitted, parts }: Props) {
  if (parts && parts.length > 0 && parts.some((p) => p.partLabel !== null)) {
    return <PartsAnswerInput questionId={questionId} offline={offline} onSubmitted={onSubmitted} parts={parts} />;
  }
  return <SingleAnswerInput questionId={questionId} offline={offline} onSubmitted={onSubmitted} />;
}

function SingleAnswerInput({ questionId, offline, onSubmitted }: Props) {
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

/** 題組作答區（004 FR-030a）：每小題一個作答框與字數，任一小題空白或超過上限時不可送出 */
function PartsAnswerInput({
  questionId,
  offline,
  onSubmitted,
  parts,
}: Props & { parts: QuestionPartView[] }) {
  const baseId = useId();
  const [drafts, setDrafts] = useState<string[]>(() => parts.map(() => ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ShownError | null>(null);
  const [locked, setLocked] = useState(false);

  const specs = parts.map((p) => ({ partIndex: p.partIndex, partLabel: p.partLabel }));
  const check = validatePartAnswers(drafts, specs);
  const canSubmit = check.ok && !busy && !offline && !locked;

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ answer: string; answers: PartAnswer[] }>('/api/student/submissions', {
        method: 'POST',
        body: { questionId, answers: drafts },
      });
      onSubmitted(res.answer, res.answers);
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
      {parts.map((p, i) => {
        const id = `${baseId}-${i}`;
        const length = countChars((drafts[i] ?? '').trim());
        const tooLong = length > MAX_ANSWER_LENGTH;
        return (
          <div className="field" key={p.partIndex}>
            <p className="question-text">
              {p.partLabel} {p.text}
            </p>
            <label htmlFor={id}>{p.partLabel}的答案</label>
            <textarea
              id={id}
              className="textarea"
              value={drafts[i] ?? ''}
              onChange={(e) =>
                setDrafts((d) => d.map((v, j) => (j === i ? e.target.value : v)))
              }
              disabled={busy}
              aria-invalid={tooLong}
              aria-describedby={`${id}-count`}
            />
            <div className="answer-meta">
              <span id={`${id}-count`} className={tooLong ? 'text-danger' : 'muted'}>
                {length} / {MAX_ANSWER_LENGTH}
              </span>
            </div>
            {tooLong && (
              <p className="text-danger">
                {p.partLabel}答案最多 {MAX_ANSWER_LENGTH} 字，目前 {length} 字，請精簡後再送出
              </p>
            )}
          </div>
        );
      })}
      <p className="muted">每個小題都要作答，整題一次送出；送出後不可修改</p>
      <ErrorMessage message={error?.message} hint={error?.hint} />
      <button type="submit" className="btn btn-accent btn-block" disabled={!canSubmit}>
        {busy ? '送出中…' : '送出答案'}
      </button>
    </form>
  );
}
