import { useState } from "react";
import { Link } from "react-router";
import { homePathFor } from "@se/shared";
import { useAuth } from "../auth/AuthContext";
import { Button } from "./Button";

/** 頁首：目前使用者與登出按鈕（US5、FR-015）。 */
export function AppHeader() {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  return (
    <header className="border-b border-line bg-paper-deep">
      <div className="mx-auto flex w-full max-w-4xl flex-wrap items-center justify-between gap-2 px-4 py-2">
        <Link to={homePathFor(user.role)} className="min-h-11 content-center font-bold text-primary">
          課程搶答系統
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-ink-soft">
            {user.displayName}（{user.username}）
          </span>
          <Link
            to="/account/password"
            className="inline-flex min-h-11 items-center px-2 text-sm text-primary underline"
          >
            變更密碼
          </Link>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await logout();
            }}
          >
            登出
          </Button>
        </div>
      </div>
    </header>
  );
}
