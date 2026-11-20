import type { ReactNode } from "react";
import { Navigate } from "react-router";
import { homePathFor, type Role } from "@se/shared";
import { AppHeader } from "../components/AppHeader";
import { LoadingScreen } from "../components/PageShell";
import { loginPathFor, useAuth } from "./AuthContext";

/**
 * 前端路由守衛（contracts/api.md「前端路由」）：未登入導向 /login，角色不符導向自己的首頁。
 * 這只是使用體驗；真正的權限檢查在後端（spec FR-012）。
 */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { user, loading, expired } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to={loginPathFor(expired)} replace />;
  if (!roles.includes(user.role)) return <Navigate to={homePathFor(user.role)} replace />;
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
