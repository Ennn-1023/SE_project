import { Link } from "react-router";
import { useAuth } from "../auth/AuthContext";
import { Card, PageShell } from "../components/PageShell";

/** 老師管理首頁（US2）。後續的題組、搶答功能會加在這裡。 */
export function TeacherHomePage() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <PageShell>
      <h1 className="mb-2 text-2xl font-bold">老師管理</h1>
      <p className="mb-6 text-ink-soft">歡迎，{user.displayName}。</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">學生帳號</h2>
          <p className="mb-4 text-ink-soft">新增、刪除學生帳號，或重設學生密碼。</p>
          <Link
            to="/teacher/students"
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-primary px-4 font-semibold text-white hover:bg-primary-strong"
          >
            學生帳號管理
          </Link>
        </Card>
      </div>
    </PageShell>
  );
}
