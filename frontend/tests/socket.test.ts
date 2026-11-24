import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOCKET_RECONNECT_OPTIONS } from '@buzzer/shared';

const fake = vi.hoisted(() => ({
  connected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
}));
const ioMock = vi.hoisted(() => vi.fn(() => fake));
vi.mock('socket.io-client', () => ({ io: ioMock }));

import { createStudentSocket } from '../src/realtime/socket';

afterEach(() => {
  vi.clearAllMocks();
  fake.connected = true;
});

describe('createStudentSocket 重連設定（SC-006、FR-005）', () => {
  it('使用 shared 的重連設定（退避上限 2 秒）', () => {
    const s = createStudentSocket();
    expect(ioMock).toHaveBeenCalledWith('/student', { withCredentials: true, ...SOCKET_RECONNECT_OPTIONS });
    expect(SOCKET_RECONNECT_OPTIONS.reconnectionDelayMax).toBeLessThanOrEqual(2000);
    s.disconnect();
  });

  it('瀏覽器回報網路恢復（online）且尚未連線時，立即重連', () => {
    const s = createStudentSocket();
    fake.connected = false;
    window.dispatchEvent(new Event('online'));
    expect(fake.connect).toHaveBeenCalledTimes(1);
    s.disconnect();
  });

  it('已連線時收到 online 不重複連線；disconnect 後不再監聽 online', () => {
    const s = createStudentSocket();
    window.dispatchEvent(new Event('online'));
    expect(fake.connect).not.toHaveBeenCalled();
    s.disconnect();
    fake.connected = false;
    window.dispatchEvent(new Event('online'));
    expect(fake.connect).not.toHaveBeenCalled();
  });
});
