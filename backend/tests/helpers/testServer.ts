import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import type { StudentView } from '@buzzer/shared';
import { Config } from '../../src/config/env';
import { openDb, type Db } from '../../src/data/db';
import { startServer, type RunningServer } from '../../src/server';
import { fastHasher } from './testApp';

/** 測試用虛構設定值（不是任何真實密碼）。 */
export const TEST_ENV = {
  STUDENT_DEFAULT_PASSWORD: 'fake-default-pw',
  TEACHER_INITIAL_PASSWORD: 'fake-teacher-pw-01',
  SESSION_SECRET: 'test-secret-'.padEnd(48, 'x'),
  TEACHER_ACCOUNT: 'teacher',
  PORT: '0',
  DATABASE_PATH: ':memory:',
  ENABLE_DEV_TOOLS: 'true',
  NODE_ENV: 'test',
};

/**
 * 搶答測試用的學生（虛構）：4 組，每組 1 位代表；第 1 組另有第 2 位學生（測試同組重複送出）；S900 未分組。
 * 整合 001 後以老師建立學生、設定組數與指派組別的方式建立（不再使用 mock 學生表）。
 */
export const TEST_GROUP_COUNT = 4;
export const TEST_STUDENTS = [
  { studentId: 'S101', name: '王小明', group: 1 },
  { studentId: 'S102', name: '李小華', group: 1 },
  { studentId: 'S201', name: '陳大文', group: 2 },
  { studentId: 'S301', name: '林美玲', group: 3 },
  { studentId: 'S401', name: '張志強', group: 4 },
  { studentId: 'S900', name: '黃未分', group: null },
] as const;

/** 登入憑證：`sid=…` 形式的 Cookie 標頭值 */
export type SessionCookie = string;

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
  /** 老師的 session cookie（啟動時已登入），供直接呼叫 /api/dev/* 使用 */
  teacherCookie: SessionCookie;
  /** 以 001 的帳號密碼登入學生，回傳 session cookie */
  loginAs(studentId: string): Promise<SessionCookie>;
  connect(cookie: SessionCookie): Promise<TestClient>;
  teacher: {
    cookie(): Promise<SessionCookie>;
    open(questionId: string, seconds?: number): Promise<request.Response>;
    timeUp(): Promise<request.Response>;
    close(): Promise<request.Response>;
    next(): Promise<request.Response>;
    end(): Promise<request.Response>;
    reset(): Promise<request.Response>;
  };
  submit(cookie: SessionCookie, questionId: string, answer: string): Promise<request.Response>;
  state(cookie: SessionCookie): Promise<StudentView>;
  stop(): Promise<void>;
}

const cookieFrom = (res: request.Response): SessionCookie => {
  const set = res.headers['set-cookie'] as unknown as string[] | undefined;
  const sid = set?.find((c) => c.startsWith('sid='));
  if (!sid) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return sid.split(';')[0]!;
};

/** 建立老師帳號、組數與測試學生；已存在時略過（重啟測試會對同一個 DB 執行兩次） */
async function seedAccounts(server: RunningServer): Promise<void> {
  const { services, repos, config, hasher } = server.container;
  await services.accounts.seedTeacher();
  if (repos.groupSettings.get().groupCount < TEST_GROUP_COUNT) {
    services.groups.setGroupCount(TEST_GROUP_COUNT);
  }
  const hash = await hasher.hash(config.studentDefaultPassword);
  for (const s of TEST_STUDENTS) {
    if (repos.users.findStudent(s.studentId)) continue;
    repos.users.createStudent(s.studentId, s.name, hash);
    if (s.group !== null) repos.users.updateGroup(s.studentId, s.group);
  }
}

/** 在隨機 port 啟動完整伺服器（預設 :memory: DB），供整合測試使用 */
export async function startTestServer(
  env: Record<string, string> = {},
  opts: { db?: Db } = {},
): Promise<TestServer> {
  const config = Config.load({ ...TEST_ENV, ...env });
  // :memory: 由測試持有；實體檔案（重啟測試）則交給伺服器開關，模擬真正的重啟
  const ownDb = opts.db ?? (config.databasePath === ':memory:' ? openDb(':memory:') : undefined);
  // 預設 PORT=0（隨機）；重連測試可指定固定 port，模擬伺服器在同一位址恢復
  const server = await startServer(config, {
    ...(ownDb ? { db: ownDb } : {}),
    hasher: fastHasher(),
  });
  await seedAccounts(server);
  const db = server.db;
  const http = request(server.url);
  const sockets: Socket[] = [];

  const login = async (account: string, password: string) =>
    cookieFrom(await http.post('/api/auth/login').send({ account, password }));

  const teacherCookie = await login(config.teacherAccount, config.teacherInitialPassword);
  const post = (path: string, body?: object) =>
    http
      .post(`/api/dev/teacher${path}`)
      .set('Cookie', teacherCookie)
      .send(body ?? {});

  return {
    server,
    url: server.url,
    db,
    http,
    teacherCookie,
    loginAs: (studentId) => login(studentId, config.studentDefaultPassword),
    connect(cookie) {
      return new Promise((resolve, reject) => {
        const socket = io(`${server.url}/student`, {
          extraHeaders: { Cookie: cookie },
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        sockets.push(socket);
        const states: StudentView[] = [];
        const waiters: Array<{
          pred: (v: StudentView) => boolean;
          resolve: (v: StudentView) => void;
        }> = [];
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
      cookie: async () => teacherCookie,
      open: (questionId, seconds) =>
        post('/open', seconds === undefined ? { questionId } : { questionId, seconds }),
      timeUp: () => post('/time-up'),
      close: () => post('/close'),
      next: () => post('/next'),
      end: () => post('/end'),
      reset: () => post('/reset'),
    },
    submit: (cookie, questionId, answer) =>
      http.post('/api/student/submissions').set('Cookie', cookie).send({ questionId, answer }),
    async state(cookie) {
      const res = await http.get('/api/student/state').set('Cookie', cookie);
      if (res.status !== 200) throw new Error(`state failed: ${res.status}`);
      return res.body as StudentView;
    },
    async stop() {
      for (const s of sockets) s.disconnect();
      await server.close();
    },
  };
}

/** 將組數增為 10 組、每組 1 位代表，回傳各組 session cookie（SC-003 壓測用） */
export async function addTenTeams(ts: TestServer): Promise<SessionCookie[]> {
  const { services, repos, config, hasher } = ts.server.container;
  services.groups.setGroupCount(10);
  const hash = await hasher.hash(config.studentDefaultPassword);
  const cookies: SessionCookie[] = [];
  for (let i = 1; i <= 10; i++) {
    const studentId = `SX${String(i).padStart(2, '0')}`;
    repos.users.createStudent(studentId, `壓測學生 ${i}`, hash);
    repos.users.updateGroup(studentId, i);
    cookies.push(await ts.loginAs(studentId));
  }
  return cookies;
}
