import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { StudentView } from '@buzzer/shared';
import { loadConfig } from '../../src/config/env';
import { openDb, type Db } from '../../src/data/db';
import { startServer, type RunningServer } from '../../src/server';

export const TEST_SECRET = 'test-secret-'.padEnd(48, 'x');

export interface TestClient {
  socket: Socket;
  states: StudentView[];
  /** 等待符合條件的 state:update（已收到的也算，從最新的開始找） */
  waitFor(pred: (v: StudentView) => boolean, timeoutMs?: number): Promise<StudentView>;
  last(): StudentView | undefined;
}

export interface TestServer {
  server: RunningServer;
  url: string;
  db: Db;
  http: ReturnType<typeof request>;
  loginAs(studentId: string): Promise<string>;
  connect(token: string): Promise<TestClient>;
  teacher: {
    open(questionId: string, seconds?: number): Promise<request.Response>;
    timeUp(): Promise<request.Response>;
    close(): Promise<request.Response>;
    next(): Promise<request.Response>;
    end(): Promise<request.Response>;
    reset(): Promise<request.Response>;
  };
  submit(token: string, questionId: string, answer: string): Promise<request.Response>;
  state(token: string): Promise<StudentView>;
  stop(): Promise<void>;
}

/** 在隨機 port 啟動完整伺服器（預設 :memory: DB），供整合測試使用 */
export async function startTestServer(
  env: Record<string, string> = {},
  opts: { db?: Db } = {},
): Promise<TestServer> {
  const config = loadConfig({
    SESSION_SECRET: TEST_SECRET,
    PORT: '0',
    SQLITE_PATH: ':memory:',
    ENABLE_DEV_TOOLS: 'true',
    NODE_ENV: 'test',
    ...env,
  });
  // :memory: 由測試持有；實體檔案（重啟測試）則交給伺服器開關，模擬真正的重啟
  const ownDb = opts.db ?? (config.sqlitePath === ':memory:' ? openDb(':memory:') : undefined);
  // 預設 PORT=0（隨機）；重連測試可指定固定 port，模擬伺服器在同一位址恢復
  const server = await startServer(config, ownDb ? { db: ownDb } : {});
  const db = server.db;
  const http = request(server.url);
  const sockets: Socket[] = [];

  const post = (path: string, body?: object) => http.post(`/api/dev/teacher${path}`).send(body ?? {});

  return {
    server,
    url: server.url,
    db,
    http,
    async loginAs(studentId) {
      const res = await http.post('/api/dev/login').send({ studentId });
      if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
      return res.body.token as string;
    },
    connect(token) {
      return new Promise((resolve, reject) => {
        const socket = io(`${server.url}/student`, {
          auth: { token },
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        sockets.push(socket);
        const states: StudentView[] = [];
        const waiters: Array<{ pred: (v: StudentView) => boolean; resolve: (v: StudentView) => void }> = [];
        socket.on('state:update', (v: StudentView) => {
          states.push(v);
          for (const w of [...waiters]) {
            if (w.pred(v)) {
              waiters.splice(waiters.indexOf(w), 1);
              w.resolve(v);
            }
          }
        });
        const client: TestClient = {
          socket,
          states,
          last: () => states[states.length - 1],
          waitFor(pred, timeoutMs = 3000) {
            // 先檢查已收到的推播（推播可能在註冊等待前就抵達）
            const existing = [...states].reverse().find(pred);
            if (existing) return Promise.resolve(existing);
            return new Promise((res, rej) => {
              const t = setTimeout(() => rej(new Error('waitFor state:update timeout')), timeoutMs);
              waiters.push({
                pred,
                resolve: (v) => {
                  clearTimeout(t);
                  res(v);
                },
              });
            });
          },
        };
        socket.once('connect', () => resolve(client));
        socket.once('connect_error', (err) => reject(err));
      });
    },
    teacher: {
      open: (questionId, seconds) =>
        post('/open', seconds === undefined ? { questionId } : { questionId, seconds }),
      timeUp: () => post('/time-up'),
      close: () => post('/close'),
      next: () => post('/next'),
      end: () => post('/end'),
      reset: () => post('/reset'),
    },
    submit: (token, questionId, answer) =>
      http
        .post('/api/student/submissions')
        .set('Authorization', `Bearer ${token}`)
        .send({ questionId, answer }),
    async state(token) {
      const res = await http.get('/api/student/state').set('Authorization', `Bearer ${token}`);
      if (res.status !== 200) throw new Error(`state failed: ${res.status}`);
      return res.body as StudentView;
    },
    async stop() {
      for (const s of sockets) s.disconnect();
      await server.close();
    },
  };
}

/** 新增 10 組、每組 1 位代表，回傳各組 token（SC-003 壓測用） */
export async function addTenTeams(ts: TestServer): Promise<string[]> {
  const repo = ts.server.ctx.repo;
  const tokens: string[] = [];
  for (let i = 1; i <= 10; i++) {
    const teamId = `X${String(i).padStart(2, '0')}`;
    repo.insertTeam({ teamId, activityId: 'A1', name: `壓測第 ${i} 組` });
    repo.insertStudent({ studentId: `SX${i}`, name: `壓測學生 ${i}`, teamId });
    tokens.push(await ts.loginAs(`SX${i}`));
  }
  return tokens;
}
