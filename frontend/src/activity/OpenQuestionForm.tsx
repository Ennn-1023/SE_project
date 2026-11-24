import { useEffect, useState, type FormEvent } from 'react';
import {
  DEFAULT_SECONDS,
  validateSeconds,
  type ActivityQuestionDetail,
  type QuestionListItem,
} from '@buzzer/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';

type QuestionLike = Pick<ActivityQuestionDetail, 'label' | 'kind' | 'stem' | 'parts'>;

/** 題目完整內容：題組含共同題幹與各小題（US2-1） */
export function QuestionContent({ question }: { question: QuestionLike }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-cream-100 p-3">
      <p className="font-bold">
        第 {question.label} 題{question.kind === 'GROUP' ? '（題組）' : ''}
      </p>
      {question.stem ? <p className="whitespace-pre-wrap break-words">{question.stem}</p> : null}
      {question.parts.map((p) => (
        <p key={p.partIndex} className="whitespace-pre-wrap break-words">
          {p.partLabel ? <span className="mr-1 font-medium">{p.partLabel}</span> : null}
          {p.text}
        </p>
      ))}
    </div>
  );
}

/** 秒數輸入：只接受整數字串，再交給共用規則判定 5～600（data-model.md §4 seconds） */
export function parseSeconds(raw: string): number | null {
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) return null;
  const check = validateSeconds(Number(text));
  return check.ok ? check.value : null;
}

interface Props {
  question: QuestionListItem;
  pending: boolean;
  /** 斷線等原因停用（不顯示處理中） */
  disabled?: boolean;
  onOpen: (seconds: number) => void;
  onReopen: (seconds: number) => void;
  /** CLOSED 時可回到等待畫面（選用，FR-012） */
  onBackToWaiting?: () => void;
}

/**
 * OpenQuestionForm（004 US2、FR-007～FR-008）：選定題目的完整內容、作答秒數（預設 60，5～600 整數）、
 * 「開始搶答」；已結束題目改為「重新開放」並先確認將取代的結果（FR-007a）。
 */
export function OpenQuestionForm({
  question,
  pending,
  disabled = false,
  onOpen,
  onReopen,
  onBackToWaiting,
}: Props) {
  const [raw, setRaw] = useState(String(DEFAULT_SECONDS));
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    setRaw(String(DEFAULT_SECONDS));
    setTouched(false);
  }, [question.questionId]);

  const seconds = parseSeconds(raw);
  const invalid = seconds === null;
  const closed = question.status === 'CLOSED';

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (seconds === null) return;
    if (closed) {
      const current = question.winnerTeamName ? `${question.winnerTeamName}搶答成功` : '無人送出';
      if (
        !window.confirm(
          `重新開放會取代第 ${question.label} 題目前的結果（${current}），確定重新開放？`,
        )
      ) {
        return;
      }
      onReopen(seconds);
    } else {
      onOpen(seconds);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submit} noValidate aria-label="開放題目">
      <QuestionContent question={question} />
      <label className="flex flex-col gap-1">
        <span className="font-medium">作答秒數</span>
        <input
          type="text"
          inputMode="numeric"
          className="min-h-11 w-32 rounded-md border border-cream-300 bg-white px-3"
          value={raw}
          aria-invalid={touched && invalid}
          aria-describedby="seconds-error"
          onChange={(e) => {
            setRaw(e.target.value);
            setTouched(true);
          }}
        />
      </label>
      {touched && invalid ? (
        <ErrorMessage id="seconds-error" message="作答秒數須為 5～600 的整數" hint="例如 60" />
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          variant={closed ? 'secondary' : 'primary'}
          disabled={pending || disabled}
        >
          {pending ? '處理中…' : closed ? '重新開放' : '開始搶答'}
        </Button>
        {onBackToWaiting ? (
          <Button variant="ghost" disabled={pending || disabled} onClick={onBackToWaiting}>
            回到等待畫面
          </Button>
        ) : null}
      </div>
    </form>
  );
}
