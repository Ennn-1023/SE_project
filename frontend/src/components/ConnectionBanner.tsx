import type { ConnectionStatus } from '../realtime/socket';

/** 斷線提示（FR-005）：固定在頂部、不遮住送出按鈕 */
export function ConnectionBanner({ status }: { status: ConnectionStatus }) {
  if (status !== 'offline') return null;
  return (
    <div className="connection-banner" role="alert">
      連線中斷，正在重新連線，請稍後再送出
    </div>
  );
}
