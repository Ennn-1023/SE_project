import type { ReactNode } from "react";

/** 頁面外框：米白底、置中、手機留 16px 邊距，避免水平捲動（SC-008）。 */
export function PageShell({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <main className={`mx-auto w-full px-4 py-6 sm:py-10 ${narrow ? "max-w-md" : "max-w-4xl"}`}>
      {children}
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-line bg-paper-deep p-5 sm:p-6 ${className}`}>
      {children}
    </section>
  );
}

export function LoadingScreen() {
  return (
    <PageShell narrow>
      <p role="status" className="text-center text-ink-soft">
        載入中…
      </p>
    </PageShell>
  );
}
