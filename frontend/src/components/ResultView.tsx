import type { MyTeamOutcome, StudentView } from '@buzzer/shared';

const OUTCOME: Record<MyTeamOutcome, { text: string; className: string }> = {
  WIN: { text: '本組搶答成功', className: 'outcome-win' },
  LOSE: { text: '本組未成功', className: 'outcome-lose' },
  NOT_SUBMITTED: { text: '本組未送出，搶答未成功', className: 'outcome-lose' },
};

/** 已結束畫面：依順位揭曉所有組別答案，並標示本組成敗（FR-017、FR-018） */
export function ResultView({ view }: { view: StudentView }) {
  const results = view.results ?? [];
  const outcome = OUTCOME[view.myTeamOutcome ?? 'NOT_SUBMITTED'];

  return (
    <section className="card result" aria-labelledby="result-title">
      <div className="answering-head">
        {view.question && (
          <span className="badge">第 {view.question.label ?? view.question.number} 題</span>
        )}
        <span className="muted">搶答已結束</span>
      </div>
      {view.question && (
        <h2 id="result-title" className="question-text">
          {view.question.text}
        </h2>
      )}

      {view.myTeam && (
        <p role="status" className={`outcome ${outcome.className}`}>
          {outcome.text}
        </p>
      )}

      {results.length === 0 ? (
        <p className="muted empty-result">本題無組別送出答案</p>
      ) : (
        <ol className="result-list" aria-label="各組答案（依搶答順位）">
          {results.map((r) => (
            <li
              key={r.rank}
              className={`result-item${r.isWinner ? ' result-winner' : ''}${
                view.myTeam?.name === r.teamName ? ' result-mine' : ''
              }`}
            >
              <span className="result-rank" aria-label={`第 ${r.rank} 名`}>
                {r.rank}
              </span>
              <div className="result-body">
                <div className="result-team">
                  <strong>{r.teamName}</strong>
                  {r.isWinner && <span className="winner-tag">搶答成功</span>}
                </div>
                {view.question?.kind === 'GROUP' && r.answers ? (
                  // 題組依小題分列（004 FR-030b）；仍不顯示送出時間與送出者
                  r.answers.map((a) => (
                    <p key={a.partIndex} className="result-answer">
                      {a.partLabel} {a.answer}
                    </p>
                  ))
                ) : (
                  <p className="result-answer">{r.answer}</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
