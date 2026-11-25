import { Link } from 'react-router';
import type { ReadinessView } from '@buzzer/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';

interface Props {
  readiness: ReadinessView;
  /** 上一場已結束（顯示「開始新活動」並先確認） */
  restart: boolean;
  pending: boolean;
  disabled?: boolean;
  onStart: () => void;
}

/** ActivityStartPanel（004 US1、FR-001）：題目集來源與題數、參與組別與人數；缺少條件時停用並說明 */
export function ActivityStartPanel({
  readiness,
  restart,
  pending,
  disabled = false,
  onStart,
}: Props) {
  const teamsWithMembers = readiness.teams.filter((t) => t.members > 0);
  const noQuestions = readiness.questionCount === 0;
  const noTeams = teamsWithMembers.length === 0;
  const start = () => {
    if (
      restart &&
      !window.confirm('確定要開始新活動嗎？上一場的結果會保留，但不再顯示於新活動。')
    ) {
      return;
    }
    onStart();
  };
  return (
    <section className="flex flex-col gap-3" aria-label="開始活動">
      <div className="flex flex-col gap-1 rounded-lg bg-cream-100 p-3">
        <p>
          題目集：{readiness.sourceTitle ?? '尚未匯入'}
          {noQuestions ? '' : `，${readiness.questionCount} 題`}
        </p>
        <p>參與組別：{teamsWithMembers.length} 組</p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {readiness.teams.map((t) => (
            <li key={t.teamId} className="rounded-full border border-cream-300 px-2 py-0.5">
              {t.name}：{t.members} 人{t.members > 0 ? `（在線 ${t.online}）` : ''}
            </li>
          ))}
        </ul>
      </div>
      {noQuestions ? (
        <ErrorMessage message="尚未匯入題目" hint="請先到題目管理匯入學習單">
          <Link to="/teacher/questions" className="text-primary underline">
            前往題目管理
          </Link>
        </ErrorMessage>
      ) : null}
      {noTeams ? (
        <ErrorMessage message="尚無任何組別有學生" hint="請先到組別管理分組">
          <Link to="/teacher/students" className="text-primary underline">
            前往組別管理
          </Link>
        </ErrorMessage>
      ) : null}
      <Button
        className="self-start"
        disabled={pending || disabled || noQuestions || noTeams}
        onClick={start}
      >
        {pending ? '處理中…' : restart ? '開始新活動' : '開始活動'}
      </Button>
    </section>
  );
}
