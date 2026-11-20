import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Card, PageShell } from "../components/PageShell";

/**
 * 學生首頁（搶答頁）。本功能先顯示等待畫面；
 * 仍使用預設密碼時顯示不阻擋操作的修改建議（US6-4、FR-018）。
 */
export function StudentHomePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <PageShell>
      <h1 className="mb-4 text-2xl font-bold">學生搶答</h1>
      {user.usesDefaultPassword ? (
        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-accent bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p>建議修改密碼：你目前使用的是全班共用的預設密碼。</p>
          <Link
            to="/account/password"
            className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong"
          >
            修改密碼
          </Link>
        </div>
      ) : null}
      <Card className="text-center">
        <p className="text-xl font-semibold">等待老師開放題目</p>
        <p className="mt-2 text-ink-soft">老師開放搶答後，題目會出現在這裡。</p>
      </Card>
    </PageShell>
  );
}
