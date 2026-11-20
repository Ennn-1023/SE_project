import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ErrorCode, type CurrentUser } from "@se/shared";
import { api, setSessionInvalidHandler } from "../api/client";

interface AuthState {
  user: CurrentUser | null;
  loading: boolean;
  /** 最近一次登入狀態失效是否因為逾時（顯示「登入已逾時」用）。 */
  expired: boolean;
  setUser: (user: CurrentUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function loginPathFor(expired: boolean): string {
  return expired ? "/login?reason=expired" : "/login";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [expired, setExpired] = useState(false);
  const navigate = useNavigate();

  const setUser = useCallback((next: CurrentUser | null) => {
    if (next) setExpired(false);
    setUserState(next);
  }, []);

  // 登入狀態失效：清除使用者並導向登入頁（逾時時帶上原因）。
  // 受保護頁面的 RequireRole 也會依 expired 導向同一個網址，兩者不會互相覆蓋。
  useEffect(() => {
    setSessionInvalidHandler((code) => {
      const isExpired = code === ErrorCode.SESSION_EXPIRED;
      setExpired(isExpired);
      setUserState(null);
      navigate(loginPathFor(isExpired), { replace: true });
    });
    return () => setSessionInvalidHandler(undefined);
  }, [navigate]);

  // 啟動或重新整理時恢復登入狀態
  useEffect(() => {
    let active = true;
    api
      .get<{ user: CurrentUser }>("/api/auth/me", { silent: true })
      .then((data) => {
        if (active) setUserState(data.user);
      })
      .catch(() => {
        if (active) setUserState(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post("/api/auth/logout");
    } catch {
      // 即使伺服器無回應，也在前端清除登入狀態
    } finally {
      setExpired(false);
      setUserState(null);
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  const value = useMemo(
    () => ({ user, loading, expired, setUser, logout }),
    [user, loading, expired, setUser, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth 必須在 AuthProvider 內使用");
  return context;
}
