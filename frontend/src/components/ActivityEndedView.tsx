export function ActivityEndedView() {
  return (
    <section className="card state-card" aria-live="polite">
      <div className="state-icon" aria-hidden="true">
        🎉
      </div>
      <h2>活動已結束，感謝參與</h2>
      <p className="muted">本場搶答已全部結束。</p>
    </section>
  );
}
