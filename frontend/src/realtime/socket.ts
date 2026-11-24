import { io, type Socket } from 'socket.io-client';
import { SOCKET_RECONNECT_OPTIONS, type StudentView } from '@buzzer/shared';

export type ConnectionStatus = 'connecting' | 'online' | 'offline';

export interface StudentSocket {
  onState(cb: (v: StudentView) => void): () => void;
  onConnectionChange(cb: (s: ConnectionStatus, reason?: string) => void): () => void;
  disconnect(): void;
}

/**
 * /student namespace 連線（contracts/socket-events.md）；只接收伺服器推播。
 * 以與 REST 相同的 session cookie 驗證（整合 001 F1），不另外傳送 token。
 * 重連設定共用 shared（退避上限 2 秒，SC-006）；瀏覽器回報網路恢復時立即重連，不等退避計時。
 */
export function createStudentSocket(url = ''): StudentSocket {
  const socket: Socket = io(`${url}/student`, {
    withCredentials: true,
    ...SOCKET_RECONNECT_OPTIONS,
  });

  const onOnline = () => {
    if (!socket.connected) socket.connect();
  };
  window.addEventListener('online', onOnline);

  return {
    onState(cb) {
      socket.on('state:update', cb);
      return () => socket.off('state:update', cb);
    },
    onConnectionChange(cb) {
      const up = () => cb('online');
      const down = () => cb('offline');
      const fail = (err: Error) => cb('offline', err.message);
      socket.on('connect', up);
      socket.on('disconnect', down);
      socket.on('connect_error', fail);
      return () => {
        socket.off('connect', up);
        socket.off('disconnect', down);
        socket.off('connect_error', fail);
      };
    },
    disconnect() {
      window.removeEventListener('online', onOnline);
      socket.disconnect();
    },
  };
}
