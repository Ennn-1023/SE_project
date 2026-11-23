import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { createApp, createContainer, type AppDeps } from './app.js';
import { Config, ConfigError } from './config/env.js';
import type { AppContext, ViewFor } from './context.js';
import { openDb, type Db } from './data/db.js';
import { seedMockData } from './data/mock/seed.js';
import { Repository } from './data/repositories.js';
import { ActivityStateMachine } from './domain/activityStateMachine.js';
import { ResultService } from './domain/resultService.js';
import { SubmissionService } from './domain/submissionService.js';
import { buildView } from './domain/visibilityFilter.js';
import { createLogger } from './lib/logger.js';
import { createRealtime } from './realtime/socketServer.js';

export interface RunningServer {
  url: string;
  port: number;
  ctx: AppContext;
  container: ReturnType<typeof createContainer>;
  db: Db;
  close(): Promise<void>;
}

/**
 * 組裝並啟動伺服器：DB（含 migration）→ 001 容器 → 搶答狀態恢復 → HTTP（Express）+ Socket.IO。
 * 001 的登入／組別與 002 的搶答共用同一個 DB、session 與錯誤格式。
 */
export async function startServer(
  config: Config,
  opts: { db?: Db } & Omit<AppDeps, 'config' | 'db'> = {},
): Promise<RunningServer> {
  const db = opts.db ?? openDb(config.databasePath);
  const container = createContainer({ ...opts, config, db });
  const repo = new Repository(db);
  seedMockData(repo);

  const machine = new ActivityStateMachine(repo);
  if (machine.recoverAfterRestart()) {
    container.logger.warn('伺服器在作答中重啟，已捨棄該題的送出並回到「等待開放」');
  }

  const submissions = new SubmissionService(machine);
  machine.hooks.onQuestionOpened = (questionId) => submissions.startQuestion(questionId);
  machine.hooks.onReset = () => submissions.clear();

  const results = new ResultService(repo);
  // 結束時先以交易寫入送出與結果，狀態機之後才推播 CLOSED（002 FR-019、FR-020）
  machine.hooks.onQuestionClosed = (questionId, reason) => {
    results.finalize(machine.activity.id, questionId, submissions.all(), reason);
  };

  const viewFor: ViewFor = (student) => {
    const activity = machine.activity;
    const qid = activity.currentQuestionId;
    // 作答中：記憶體中的送出；已結束：已寫入資料庫的送出（重啟後也能還原）
    const current =
      activity.phase === 'CLOSED' && qid
        ? repo.listSubmissions(activity.id, qid)
        : submissions.all();
    return buildView({
      activity,
      question: qid ? repo.getQuestion(qid) : null,
      myTeam: student.teamId ? repo.getTeam(student.teamId) : null,
      teams: repo.listTeams(activity.id),
      submissions: current,
      now: Date.now(),
    });
  };

  // Express 必須在 Socket.IO 之前掛上：Socket.IO 會包裝「已存在」的 request listener，
  // 讓 /socket.io 的 HTTP long-polling 請求只交給 engine.io，不會被 Express 回 404。
  let appHandler: ReturnType<typeof createApp>['app'] | null = null;
  const httpServer = createServer((req, res) => appHandler?.(req, res));
  const realtime = createRealtime(httpServer, {
    clientOrigin: config.clientOrigin,
    sessions: container.services.sessions,
    users: container.repos.users,
    repo,
    viewFor,
  });
  const ctx: AppContext = { config, repo, machine, submissions, viewFor, realtime };
  machine.hooks.onChange = () => realtime.pushAll();
  appHandler = createApp({ config, db, container, buzzer: ctx }).app;

  await new Promise<void>((res) => httpServer.listen(config.port, res));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    url: `http://localhost:${port}`,
    port,
    ctx,
    container,
    db,
    async close() {
      machine.dispose();
      await realtime.close();
      await new Promise<void>((res) => httpServer.close(() => res()));
      if (!opts.db) db.close();
    },
  };
}

/** 進入點：載入 Config（缺漏時列出變數名稱並結束，FR-001）→ startServer。 */
async function main() {
  Config.loadDotenv();
  let config: Config;
  try {
    config = Config.load(process.env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
  const logger = createLogger({ silent: false });
  const server = await startServer(config, { logger });
  logger.info('server started', {
    port: server.port,
    env: config.nodeEnv,
    devTools: config.enableDevTools,
  });
  const shutdown = () => void server.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isEntry) void main();
