import { useEffect, useReducer } from 'react';
import type { StudentView } from '@buzzer/shared';
import { api, ApiError } from '../api/client';
import { createStudentSocket, type ConnectionStatus, type StudentSocket } from '../realtime/socket';

export interface StudentState {
  view: StudentView | null;
  connection: ConnectionStatus;
  /** serverTime - deviceTime（ms），用來校正倒數 */
  clockOffset: number;
  authError: boolean;
}

type Action =
  | { type: 'view'; view: StudentView; receivedAt: number }
  | { type: 'connection'; status: ConnectionStatus }
  | { type: 'authError' };

export const initialStudentState: StudentState = {
  view: null,
  connection: 'connecting',
  clockOffset: 0,
  authError: false,
};

export function studentReducer(state: StudentState, action: Action): StudentState {
  switch (action.type) {
    case 'view':
      // REST 回應與 socket 推播可能交錯抵達：比伺服器時間更舊的狀態一律忽略
      if (state.view && Date.parse(action.view.serverNow) < Date.parse(state.view.serverNow)) {
        return state;
      }
      return {
        ...state,
        view: action.view,
        clockOffset: Date.parse(action.view.serverNow) - action.receivedAt,
      };
    case 'connection':
      return { ...state, connection: action.status };
    case 'authError':
      return { ...state, authError: true };
  }
}

export type SocketFactory = () => StudentSocket;

/** REST 取回目前狀態 + 訂閱 state:update（research.md R9） */
/** 預設的 socket 工廠（模組層級常數，避免每次 render 產生新函式而重複連線） */
const defaultSocketFactory: SocketFactory = () => createStudentSocket();

export function useStudentState(socketFactory: SocketFactory = defaultSocketFactory) {
  const [state, dispatch] = useReducer(studentReducer, initialStudentState);

  useEffect(() => {
    let active = true;
    const applyView = (view: StudentView) => {
      if (active) dispatch({ type: 'view', view, receivedAt: Date.now() });
    };
    const refresh = () =>
      api<StudentView>('/api/student/state')
        .then(applyView)
        .catch((e: unknown) => {
          if (active && e instanceof ApiError && e.status === 401) dispatch({ type: 'authError' });
        });

    const socket = socketFactory();
    const offState = socket.onState(applyView);
    const offConn = socket.onConnectionChange((status, reason) => {
      if (!active) return;
      dispatch({ type: 'connection', status });
      if (reason === 'UNAUTHORIZED') dispatch({ type: 'authError' });
      if (status === 'online') void refresh();
    });
    void refresh();

    return () => {
      active = false;
      offState();
      offConn();
      socket.disconnect();
    };
  }, [socketFactory]);

  return state;
}
