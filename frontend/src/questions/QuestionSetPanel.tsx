import type { ReactNode } from 'react';
import type { QuestionSetView } from '@buzzer/shared';

/** 題目清單（預覽與目前題目集共用）：題號、共同題幹、小題、題目文字與作答格位置。 */
export function QuestionList({ questions }: { questions: QuestionSetView['questions'] }) {
  return (
    <ol className="flex flex-col gap-2">
      {questions.map((q, i) => (
        <li
          key={`${q.label}-${i}`}
          aria-label={`第 ${q.label} 題`}
          className="flex flex-col gap-1 rounded-lg border border-cream-300 bg-cream-50 p-3"
        >
          <p className="font-bold">
            第 {q.label} 題{' '}
            <span className="text-sm font-normal">（{q.kind === 'GROUP' ? '題組' : '單題'}）</span>
          </p>
          {q.stem ? (
            <p className="break-all text-sm">
              共同題幹（{q.stem.cell}）：{q.stem.text}
            </p>
          ) : null}
          <ul className="flex flex-col gap-1">
            {q.parts.map((p, pi) => (
              <li key={pi} className="flex flex-col text-sm">
                {p.partLabel ? <span className="font-medium">{p.partLabel}</span> : null}
                <span className="break-all">{p.text}</span>
                <span className="text-xs">
                  題目格 {p.questionCell}・作答格 {p.answerCell}
                  {p.answerHasContent ? '（作答格已有內容）' : ''}
                </span>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

export interface QuestionSetPanelProps {
  questionSet: QuestionSetView | null;
  /** 題目集標題列右側的操作按鈕（重新匯入、清除） */
  actions?: ReactNode;
}

const formatTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { hour12: false });

/** QuestionSetPanel（組件圖 003-component、FR-029）：目前題目集。 */
export function QuestionSetPanel({ questionSet, actions }: QuestionSetPanelProps) {
  return (
    <section
      aria-labelledby="question-set-heading"
      className="flex min-w-0 flex-col gap-3 rounded-xl border border-cream-300 bg-cream-100 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="question-set-heading" className="text-lg font-bold">
          目前題目集
        </h3>
        {questionSet ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {questionSet ? (
        <>
          <p className="break-all">
            {questionSet.source.spreadsheetTitle}／{questionSet.source.sheetTitle}・共{' '}
            {questionSet.questionCount} 題、{questionSet.slotCount} 個作答格
          </p>
          {questionSet.importedAt ? (
            <p className="text-sm">匯入時間：{formatTime(questionSet.importedAt)}</p>
          ) : null}
          <QuestionList questions={questionSet.questions} />
        </>
      ) : (
        <p>尚未匯入任何題目，請貼上學習單連結開始匯入</p>
      )}
    </section>
  );
}
