export function WaitingView() {
  return (
    <section className="card state-card" aria-live="polite">
      <div className="state-icon" aria-hidden="true">
        ⏳
      </div>
      <h2>等待老師開放題目</h2>
      <p className="muted">題目開放後，畫面會自動切換。</p>
    </section>
  );
}
