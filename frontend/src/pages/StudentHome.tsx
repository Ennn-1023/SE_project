import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type MyGroupView } from '../api/apiClient';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { Layout } from '../components/Layout';

const toApiError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', '操作失敗，請稍後再試');

/** StudentHome：顯示組別狀態，未分配時可從 1..N 自選（contracts/ui-routes.md「學生首頁狀態」）。 */
export function StudentHome() {
  const { user } = useAuth();
  const [view, setView] = useState<MyGroupView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setView(await api.myGroup());
    } catch (err) {
      setError(toApiError(err));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const choose = async (groupNumber: number) => {
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      setView(await api.selectGroup(groupNumber));
    } catch (err) {
      const e = toApiError(err);
      setError(e);
      const d = e.details ?? {};
      if (e.code === 'ALREADY_ASSIGNED' && typeof d.currentGroupNumber === 'number') {
        setView((v) => ({
          groupCount: v?.groupCount ?? 0,
          groupNumber: d.currentGroupNumber as number,
        }));
      } else if (e.code === 'GROUPS_NOT_OPEN') {
        setView((v) => ({ groupNumber: v?.groupNumber ?? null, groupCount: 0 }));
      } else if (typeof d.groupCount === 'number') {
        setView((v) => ({
          groupNumber: v?.groupNumber ?? null,
          groupCount: d.groupCount as number,
        }));
      } else {
        await refresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout title="學生首頁">
      <section
        className="flex flex-col gap-4 rounded-xl border border-cream-300 bg-cream-100 p-4"
        aria-live="polite"
      >
        <p className="text-lg break-words">
          {user?.displayName}（{user?.account}）
        </p>
        <ErrorMessage message={error?.message} hint={error?.hint} />
        {view === null ? (
          <p>載入中…</p>
        ) : view.groupNumber !== null ? (
          <p className="text-2xl font-bold text-accent">你在第 {view.groupNumber} 組</p>
        ) : view.groupCount === 0 ? (
          <p className="text-lg font-medium">老師尚未開放分組</p>
        ) : (
          <>
            <div>
              <p className="text-lg font-medium">尚未分組</p>
              <p className="text-sm">請選擇要加入的組別；選定後只能由老師調整。</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {Array.from({ length: view.groupCount }, (_, i) => i + 1).map((g) => (
                <Button key={g} variant="secondary" disabled={submitting} onClick={() => choose(g)}>
                  第 {g} 組
                </Button>
              ))}
            </div>
          </>
        )}
      </section>
    </Layout>
  );
}
