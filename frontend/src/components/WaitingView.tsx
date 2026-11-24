/** 等待畫面；noActivity 為「目前沒有進行中的活動」（004 FR-030） */
export function WaitingView({ noActivity = false }: { noActivity?: boolean }) {
  return (
    <section className="card state-card" aria-live="polite">
      <div className="state-icon" aria-hidden="true">
        ⏳
      </div>
      <h2>{noActivity ? '目前沒有進行中的活動，請等待老師開始' : '等待老師開放題目'}</h2>
      <p className="muted">
        {noActivity ? '老師開始活動後，畫面會自動切換。' : '題目開放後，畫面會自動切換。'}
      </p>
    </section>
  );
}
