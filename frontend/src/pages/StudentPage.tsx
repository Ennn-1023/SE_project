import { Link, Navigate } from 'react-router';
import { useStudentState, type SocketFactory } from '../hooks/useStudentState';
import { WaitingView } from '../components/WaitingView';
import { AnsweringView } from '../components/AnsweringView';
import { ResultView } from '../components/ResultView';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { ActivityEndedView } from '../components/ActivityEndedView';

interface Props {
  socketFactory?: SocketFactory;
}

/**
 * 學生搶答頁：依伺服器的活動階段切換畫面（002 FR-001）。
 * 登入由路由守衛（001 F1）確認；session 失效（REST 401 或 socket UNAUTHORIZED）時回到登入頁。
 */
export function StudentPage({ socketFactory }: Props) {
  const state = useStudentState(socketFactory);

  if (state.authError) {
    return <Navigate to="/login" replace />;
  }

  const { view, clockOffset, connection } = state;
  // 斷線或尚未連上時停用送出（FR-005）
  const offline = connection !== 'online';

  return (
    <>
      <ConnectionBanner status={connection} />
      <main className="page">
        <header className="student-header">
          <h1 className="app-title">課堂搶答</h1>
          {view && <span className="team-chip">{view.myTeam ? view.myTeam.name : '尚未分組'}</span>}
        </header>
        <Link to="/student" className="btn btn-outline">
          回學生首頁
        </Link>
        {!view && <p className="muted">載入中…</p>}
        {view?.phase === 'NO_ACTIVITY' && <WaitingView noActivity />}
        {view?.phase === 'WAITING' && <WaitingView />}
        {view?.phase === 'ANSWERING' && (
          // 以題目 ID 作為 key：換題時清除上一題的草稿與已送出狀態
          <AnsweringView
            key={view.question?.questionId}
            view={view}
            clockOffset={clockOffset}
            offline={offline}
          />
        )}
        {view?.phase === 'CLOSED' && <ResultView view={view} />}
        {view?.phase === 'ENDED' && <ActivityEndedView />}
      </main>
    </>
  );
}
