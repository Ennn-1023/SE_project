import { createServer } from 'node:http';
import { resolve } from 'node:path';
import type { AddressInfo } from 'node:net';
import { EnvError, loadConfig, type Config } from './config/env';
import { openDb, type Db } from './data/db';
import { Repository } from './data/repositories';
import { seedMockData } from './data/mock/seed';
import { ActivityStateMachine } from './domain/activityStateMachine';
import { buildView } from './domain/visibilityFilter';
import { SubmissionService } from './domain/submissionService';
import { ResultService } from './domain/resultService';
import { createApp } from './http/app';
import { createRealtime } from './realtime/socketServer';
import type { AppContext, ViewFor } from './context';

export interface RunningServer {
  url: string;
  port: number;
  ctx: AppContext;
  db: Db;
  close(): Promise<void>;
}

/** 組裝並啟動伺服器：env → DB → seed → 恢復活動狀態 → HTTP + Socket.IO */
export async function startServer(config: Config, opts: { db?: Db } = {}): Promise<RunningServer> {
  const db = opts.db ?? openDb(config.sqlitePath);
  const repo = new Repository(db);
  seedMockData(repo);

  const machine = new ActivityStateMachine(repo);
  if (machine.recoverAfterRestart()) {
    console.warn('[startup] 伺服器在作答中重啟，已捨棄該題的送出並回到「等待開放」');
  }

  const submissions = new SubmissionService(machine);
  machine.hooks.onQuestionOpened = (questionId) => submissions.startQuestion(questionId);
  machine.hooks.onReset = () => submissions.clear();

  const results = new ResultService(repo);
  // 結束時先以交易寫入送出與結果，狀態機之後才推播 CLOSED（FR-019、FR-020）
  machine.hooks.onQuestionClosed = (questionId, reason) => {
    results.finalize(machine.activity.id, questionId, submissions.all(), reason);
  };

  const viewFor: ViewFor = (student) => {
    const activity = machine.activity;
    const qid = activity.currentQuestionId;
    // 作答中：記憶體中的送出；已結束：已寫入資料庫的送出（重啟後也能還原）
    const current =
      activity.phase === 'CLOSED' && qid ? repo.listSubmissions(activity.id, qid) : submissions.all();
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
  let appHandler: ReturnType<typeof createApp> | null = null;
  const httpServer = createServer((req, res) => appHandler?.(req, res));
  const realtime = createRealtime(httpServer, {
    secret: config.sessionSecret,
    clientOrigin: config.clientOrigin,
    repo,
    viewFor,
  });
  const ctx: AppContext = { config, repo, machine, submissions, viewFor, realtime };
  machine.hooks.onChange = () => realtime.pushAll();
  appHandler = createApp(ctx);

  await new Promise<void>((res) => httpServer.listen(config.port, res));
  const port = (httpServer.address() as AddressInfo).port;

  return {
    url: `http://localhost:${port}`,
    port,
    ctx,
    db,
    async close() {
      machine.dispose();
      await realtime.close();
      await new Promise<void>((res) => httpServer.close(() => res()));
      if (!opts.db) db.close();
    },
  };
}

async function main() {
  let config: Config;
  try {
    config = loadConfig();
  } catch (e) {
    if (e instanceof EnvError) {
      console.error(e.message);
      process.exit(1);
    }
    throw e;
  }
  const server = await startServer(config);
  console.log(`[startup] 後端已啟動：${server.url}${config.enableDevTools ? '（dev 工具已啟用）' : ''}`);
  const shutdown = () => void server.close().then(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

const isEntry = process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename;
if (isEntry) void main();
