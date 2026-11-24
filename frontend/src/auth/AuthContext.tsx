import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, authEvents, UNAUTHENTICATED_EVENT, type CurrentUser } from '../api/apiClient';

interface AuthContextValue {
  user: CurrentUser | null;
  /** 首次向 /api/auth/me 查詢中 */
  loading: boolean;
  setUser: (user: CurrentUser | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 目前使用者狀態：載入時呼叫 GET /api/auth/me；收到「未登入」事件時清除狀態。 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    api
      .me()
      .then((res) => active && setUser(res.user))
      .catch(() => active && setUser(null))
      .finally(() => active && setLoading(false));
    const onUnauthenticated = () => setUser(null);
    authEvents.addEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    return () => {
      active = false;
      authEvents.removeEventListener(UNAUTHENTICATED_EVENT, onUnauthenticated);
    };
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // 已失效的登入狀態也視為登出成功
    }
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, setUser, logout }), [user, loading, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
