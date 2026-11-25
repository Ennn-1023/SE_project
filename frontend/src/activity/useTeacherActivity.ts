import { useCallback, useEffect, useReducer, useRef } from 'react';
import type { TeacherActivityView } from '@buzzer/shared';
import { api, ApiError } from '../api/apiClient';
import { createTeacherSocket, type ConnectionStatus, type TeacherSocket } from '../realtime/socket';

export interface ActionError {
  message: string;
  hint?: string;
}

export interface TeacherActivityState {
  view: TeacherActivityView | null;
  connection: ConnectionStatus;
  /** serverTime - deviceTime（ms），用來校正倒數 */
  clockOffset: number;
  /** 進行中的操作名稱（停用按鈕防連點，FR-014） */
  pending: string | null;
  error: ActionError | null;
  loadError: ActionError | null;
}

type Action =
  | { type: 'view'; view: TeacherActivityView; receivedAt: number }
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'pending'; name: string | null }
  | { type: 'error'; error: ActionError | null }
  | { type: 'loadError'; error: ActionError };

export const initialTeacherActivityState: TeacherActivityState = {
  view: null,
  connection: 'connecting',
  clockOffset: 0,
  pending: null,
  error: null,
  loadError: null,
};

export function teacherActivityReducer(
  state: TeacherActivityState,
  action: Action,
): TeacherActivityState {
  switch (action.type) {
    case 'view':
      // REST 回應與 teacher:update 可能交錯抵達：比伺服器時間更舊的視圖一律忽略（contracts/socket-events.md）
      if (state.view && Date.parse(action.view.serverNow) < Date.parse(state.view.serverNow)) {
        return state;
      }
      return {
        ...state,
        view: action.view,
        loadError: null,
        clockOffset: Date.parse(action.view.serverNow) - action.receivedAt,
      };
    case 'connection':
      return { ...state, connection: action.status };
    case 'pending':
      return { ...state, pending: action.name, ...(action.name ? { error: null } : {}) };
    case 'error':
      return { ...state, error: action.error };
    case 'loadError':
      return { ...state, loadError: action.error };
  }
}

export type TeacherSocketFactory = () => TeacherSocket;
const defaultSocketFactory: TeacherSocketFactory = () => createTeacherSocket();

const toActionError = (e: unknown): ActionError =>
  e instanceof ApiError
    ? { message: e.message, hint: e.hint }
    : { message: '系統發生錯誤，請稍後再試' };

/**
 * 老師活動頁的狀態（004 contracts/ui-routes.md）：REST 取回完整視圖 + 訂閱 teacher:update；
 * 重新整理或重連後以 GET /api/teacher/activity 回到正確畫面（FR-024）。
 * 斷線時拒絕操作，不顯示為成功（FR-025）。
 */
export function useTeacherActivity(socketFactory: TeacherSocketFactory = defaultSocketFactory) {
  const [state, dispatch] = useReducer(teacherActivityReducer, initialTeacherActivityState);
  const activeRef = useRef(true);
  const connectionRef = useRef<ConnectionStatus>('connecting');
  const pendingRef = useRef<string | null>(null);

  const applyView = useCallback((view: TeacherActivityView) => {
    if (activeRef.current) dispatch({ type: 'view', view, receivedAt: Date.now() });
  }, []);

  const refresh = useCallback(
    () =>
      api
        .getActivity()
        .then(applyView)
        .catch((e: unknown) => {
          if (activeRef.current) dispatch({ type: 'loadError', error: toActionError(e) });
        }),
    [applyView],
  );

  useEffect(() => {
    activeRef.current = true;
    const socket = socketFactory();
    const offView = socket.onView(applyView);
    const offConn = socket.onConnectionChange((status, reason) => {
      if (!activeRef.current) return;
      connectionRef.current = status;
      dispatch({ type: 'connection', status });
      // 連線恢復，或因登入失效被拒（session 逾時）：以 REST 重新取得狀態；
      // 後者會收到 401，由 ApiClient 通知 AuthContext 並導向登入頁（spec Edge Case「老師 session 逾時」）
      if (status === 'online' || reason === 'UNAUTHORIZED') void refresh();
    });
    void refresh();
    return () => {
      activeRef.current = false;
      offView();
      offConn();
      socket.disconnect();
    };
  }, [socketFactory, applyView, refresh]);

  /** 執行一個老師操作；斷線或已有操作進行中時不送出。成功回傳 true。 */
  const run = useCallback(
    async (name: string, fn: () => Promise<TeacherActivityView>): Promise<boolean> => {
      if (pendingRef.current) return false;
      if (connectionRef.current === 'offline') {
        dispatch({
          type: 'error',
          error: { message: '連線中斷，正在重新連線，請稍後再操作' },
        });
        return false;
      }
      pendingRef.current = name;
      dispatch({ type: 'pending', name });
      try {
        applyView(await fn());
        return true;
      } catch (e) {
        if (activeRef.current) {
          dispatch({ type: 'error', error: toActionError(e) });
          // 409 等狀態錯誤：以伺服器最新狀態重新渲染
          if (e instanceof ApiError && e.status === 409) void refresh();
        }
        return false;
      } finally {
        pendingRef.current = null;
        if (activeRef.current) dispatch({ type: 'pending', name: null });
      }
    },
    [applyView, refresh],
  );

  const clearError = useCallback(() => dispatch({ type: 'error', error: null }), []);

  return { state, run, refresh, clearError };
}
