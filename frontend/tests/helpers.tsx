import { vi } from 'vitest';
import { act } from '@testing-library/react';
import type { StudentView } from '@buzzer/shared';
import type { ConnectionStatus, StudentSocket } from '../src/realtime/socket';

/** 可由測試手動推播的假 socket */
export function createFakeSocket() {
  let stateCb: ((v: StudentView) => void) | null = null;
  let connCb: ((s: ConnectionStatus, reason?: string) => void) | null = null;
  const socket: StudentSocket = {
    onState(cb) {
      stateCb = cb;
      return () => (stateCb = null);
    },
    onConnectionChange(cb) {
      connCb = cb;
      return () => (connCb = null);
    },
    disconnect: vi.fn(),
  };
  return {
    factory: () => socket,
    push(v: StudentView) {
      act(() => stateCb?.(v));
    },
    connection(s: ConnectionStatus, reason?: string) {
      act(() => connCb?.(s, reason));
    },
  };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export function answeringView(over: Partial<StudentView> = {}): StudentView {
  return {
    phase: 'ANSWERING',
    serverNow: new Date().toISOString(),
    myTeam: { teamId: 'T1', name: '第 1 組' },
    question: { questionId: 'Q1', number: 1, text: '題目一' },
    endsAt: new Date(Date.now() + 30_000).toISOString(),
    myTeamSubmission: null,
    ...over,
  };
}

/** 依網址回應的 fetch stub */
export function routeFetch(routes: Record<string, () => Response | Promise<Response>>) {
  return vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${String(input)}`;
    const handler = routes[key];
    if (!handler) return Promise.reject(new Error(`unexpected fetch ${key}`));
    return Promise.resolve(handler());
  });
}
