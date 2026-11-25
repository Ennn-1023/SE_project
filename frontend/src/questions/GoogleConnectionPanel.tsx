import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { api, ApiError, type GoogleStatus } from '../api/apiClient';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';

/** OAuth 回呼結果訊息（contracts/ui-routes.md「查詢參數 ?google=」）。 */
const RESULT_TEXT: Record<string, { text: string; ok: boolean }> = {
  connected: { text: '已完成 Google 帳號連結', ok: true },
  denied: { text: '未完成 Google 帳號連結，請再試一次', ok: false },
  scope_missing: { text: '需要同意存取 Google 試算表，才能匯入學習單', ok: false },
  state_invalid: { text: '連結請求已失效，請重新按「連結 Google 帳號」', ok: false },
  error: { text: '暫時無法完成 Google 帳號連結，請稍後再試', ok: false },
};

export interface GoogleConnectionPanelProps {
  /** 連結狀態變更時通知父元件（決定能否讀取學習單）。 */
  onStatus?: (status: GoogleStatus) => void;
  /** 前往 Google 授權頁（測試時注入）。 */
  navigateExternal?: (url: string) => void;
}

/** GoogleConnectionPanel（組件圖 003-component、FR-001／FR-002）：Google 帳號連結狀態與連結／中斷。 */
export function GoogleConnectionPanel({
  onStatus,
  navigateExternal = (url) => window.location.assign(url),
}: GoogleConnectionPanelProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<GoogleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice] = useState(() => {
    const key = new URLSearchParams(location.search).get('google');
    return key ? (RESULT_TEXT[key] ?? null) : null;
  });

  // 顯示結果後移除查詢參數，避免重新整理時重複顯示
  useEffect(() => {
    if (new URLSearchParams(location.search).has('google')) {
      navigate({ pathname: location.pathname, search: '' }, { replace: true });
    }
    // 只在載入時處理一次
  }, []);

  const load = useCallback(async () => {
    try {
      const s = await api.getGoogleStatus();
      setStatus(s);
      onStatus?.(s);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
    }
  }, [onStatus]);

  useEffect(() => {
    void load();
  }, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const { authUrl } = await api.startGoogleAuth();
      navigateExternal(authUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!window.confirm('確定要中斷 Google 連結嗎？已匯入的題目集會保留，之後要匯入需重新連結。')) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.disconnectGoogle();
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e : null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-labelledby="google-heading"
      className="flex flex-col gap-3 rounded-xl border border-cream-300 bg-cream-100 p-4"
    >
      <h3 id="google-heading" className="text-lg font-bold">
        Google 帳號
      </h3>
      {notice ? (
        <p
          role="status"
          className={`rounded-md px-3 py-2 ${notice.ok ? 'bg-cream-50 text-primary' : 'bg-cream-50 text-danger'}`}
        >
          {notice.text}
        </p>
      ) : null}
      {status === null && !error ? <p role="status">載入中…</p> : null}
      {status && !status.configured ? (
        <ErrorMessage message="系統尚未設定 Google 試算表串接" hint="請聯絡系統管理者" />
      ) : null}
      {status?.configured && !status.connected ? (
        <div className="flex flex-col items-start gap-2">
          <p>請先連結 Google 帳號，才能讀取學習單</p>
          <Button onClick={connect} disabled={busy}>
            連結 Google 帳號
          </Button>
        </div>
      ) : null}
      {status?.configured && status.connected ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="break-all">已連結 Google 帳號：{status.googleEmail}</p>
          <Button variant="ghost" onClick={disconnect} disabled={busy}>
            中斷 Google 連結
          </Button>
        </div>
      ) : null}
      <ErrorMessage message={error?.message} hint={error?.hint} />
    </section>
  );
}
