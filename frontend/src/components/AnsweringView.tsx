import { useState } from 'react';
import type { StudentView } from '@buzzer/shared';
import { AnswerInput } from './AnswerInput';
import { CountdownTimer } from './CountdownTimer';

interface Props {
  view: StudentView;
  clockOffset: number;
  offline: boolean;
}

/** 作答中畫面：題號、題目、倒數、作答區；只顯示本組狀態（FR-001、FR-008） */
export function AnsweringView({ view, clockOffset, offline }: Props) {
  // 伺服器推播前，先以送出回應顯示「本組已送出」
  const [localAnswer, setLocalAnswer] = useState<string | null>(null);
  const question = view.question;
  if (!question) return null;
  const submitted = view.myTeamSubmission?.answer ?? localAnswer;

  return (
    <section className="card answering" aria-labelledby="question-title">
      <div className="answering-head">
        <span className="badge">第 {question.number} 題</span>
        <CountdownTimer endsAt={view.endsAt} clockOffset={clockOffset} />
      </div>
      <h2 id="question-title" className="question-text">
        {question.text}
      </h2>
      {submitted != null ? (
        <div className="alert alert-success submitted" aria-live="polite">
          <strong>本組已送出</strong>
          <p className="submitted-answer">{submitted}</p>
          <p className="muted">等待搶答結束後揭曉結果。</p>
        </div>
      ) : (
        <AnswerInput questionId={question.questionId} offline={offline} onSubmitted={setLocalAnswer} />
      )}
    </section>
  );
}
