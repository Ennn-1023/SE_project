import { useState } from 'react';
import type { ClosedReason, MonitorTeamRow, PartAnswer, ResultBoardView } from '@buzzer/shared';
import { Button } from '../components/Button';

const COLLAPSE_LINES = 6;

/** 答案以純文字顯示並保留換行（FR-020）；超過 6 行可收合／展開 */
export function AnswerText({ answers }: { answers: PartAnswer[] }) {
  const [expanded, setExpanded] = useState(false);
  const lines = answers.reduce((n, a) => n + a.answer.split('\n').length, 0);
  const long = lines > COLLAPSE_LINES || answers.some((a) => [...a.answer].length > 240);
  return (
    <div className="flex flex-col gap-1">
      <div
        className={long && !expanded ? 'max-h-36 overflow-hidden' : undefined}
        data-testid="answer-text"
      >
        {answers.map((a) => (
          <p key={a.partIndex} className="whitespace-pre-wrap break-words">
            {a.partLabel ? <span className="mr-1 font-medium">{a.partLabel}</span> : null}
            {a.answer}
          </p>
        ))}
      </div>
      {long ? (
        <Button variant="ghost" className="self-start" onClick={() => setExpanded((v) => !v)}>
          {expanded ? '收合答案' : '展開完整答案'}
        </Button>
      ) : null}
    </div>
  );
}

const REASON_LABEL: Record<ClosedReason, string> = {
  TIME_UP: '時間到',
  MANUAL: '手動結束',
  ACTIVITY_ENDED: '結束活動',
};

export function formatElapsed(sec: number | null): string {
  return sec == null ? '' : `開放後 ${sec.toFixed(1)} 秒`;
}

function OnlineBadge({ row }: { row: MonitorTeamRow }) {
  return (
    <span className="text-sm text-ink/70">
      {row.online > 0 ? `在線 ${row.online}／${row.members}` : '離線'}
    </span>
  );
}

/** 一個組別列（監控看板與結果看板共用） */
export function TeamRow({ row, highlight }: { row: MonitorTeamRow; highlight?: string }) {
  return (
    <li
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        row.submitted
          ? 'border-cream-300 bg-cream-100'
          : 'border-dashed border-cream-300 bg-cream-50'
      } ${highlight ? 'border-2 border-accent' : ''}`}
      data-testid={`team-${row.teamId}`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-bold">
          {row.rank ? `第 ${row.rank} 名 ` : ''}
          {row.teamName}
        </span>
        {highlight ? (
          <span className="rounded-full bg-accent px-2 py-0.5 text-sm font-medium text-ink">
            {highlight}
          </span>
        ) : null}
        {!row.submitted ? <span className="text-sm text-ink/70">未送出</span> : null}
        <OnlineBadge row={row} />
      </div>
      {row.submitted ? (
        <>
          <p className="text-sm text-ink/70">
            {[
              formatElapsed(row.elapsedSeconds),
              row.submitterName ? `送出者：${row.submitterName}` : '',
            ]
              .filter(Boolean)
              .join(' / ')}
          </p>
          {row.answers ? <AnswerText answers={row.answers} /> : null}
        </>
      ) : null}
    </li>
  );
}

/** ResultBoard（004 US4、FR-018）：依順位列出所有組別答案、搶答成功組、未送出組與結束原因 */
export function ResultBoard({ result }: { result: ResultBoardView }) {
  const { question } = result;
  return (
    <section className="flex flex-col gap-3" aria-label={`第 ${question.label} 題結果`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-bold">第 {question.label} 題結果</h3>
        <span className="rounded-full bg-cream-300 px-3 py-1 text-sm">
          結束原因：{REASON_LABEL[result.closedReason]}
          {result.round > 1 ? `（第 ${result.round} 輪）` : ''}
        </span>
      </div>
      {result.noSubmission ? (
        <p className="rounded-lg bg-cream-100 p-3 font-medium">本題無組別送出答案</p>
      ) : null}
      <ul className="flex flex-col gap-2">
        {result.rows.map((row) => (
          <TeamRow key={row.teamId} row={row} highlight={row.rank === 1 ? '搶答成功' : undefined} />
        ))}
      </ul>
    </section>
  );
}
