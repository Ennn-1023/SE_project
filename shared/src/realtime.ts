/**
 * Socket.IO 重連設定（contracts/socket-events.md、SC-006）。
 * 退避上限 2000ms、隨機幅度 ±20%：網路恢復後最多約 2.4 秒就會重試，
 * 加上取回狀態的時間，可在 3 秒內回到正確畫面。前端與整合測試共用同一份設定。
 */
export const SOCKET_RECONNECT_OPTIONS = {
  reconnection: true,
  reconnectionDelay: 500,
  reconnectionDelayMax: 2000,
  randomizationFactor: 0.2,
} as const;

/** SC-006：重新整理或斷線恢復後回到正確畫面的時間上限 */
export const RECOVERY_TARGET_MS = 3000;
