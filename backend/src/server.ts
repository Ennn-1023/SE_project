import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { resolve } from 'node:path';
import { createApp, createContainer, type AppDeps } from './app.js';
import { Config, ConfigError } from './config/env.js';
import type { AppContext, ViewFor } from './context.js';
import { openDb, type Db } from './data/db.js';
import { Repository } from './data/repositories.js';
import { ActivityStateMachine } from './domain/activityStateMachine.js';
import { ResultService } from './domain/resultService.js';
import { SubmissionService } from './domain/submissionService.js';
import { buildView } from './domain/visibilityFilter.js';
import { createLogger } from './lib/logger.js';
import { ActivityService } from './services/activityService.js';
import { MonitorViewBuilder } from './services/monitorViewBuilder.js';
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
 * 組裝並啟動伺服器：DB（含 migration）→ 001 容器 → 搶答狀態恢復 → HTTP（Express）+ Socket.IO（/student、/teacher）。
 * 001 的登入／組別與 002 的搶答共用同一個 DB、session 與錯誤格式。
 */
export async function startServer(
  config: Config,
  opts: { db?: Db } & Omit<AppDeps, 'config' | 'db'> = {},
): Promise<RunningServer> {
  const db = opts.db ?? openDb(config.databasePath);
  const container = createContainer({ ...opts, config, db });
  const repo = new Repository(db);

  const machine = new ActivityStateMachine(repo);
  const submissions = new SubmissionService(machine);
  const results = new ResultService(repo);
  const monitor = new MonitorViewBuilder({
    machine,
    repo,
    submissions,
    questionSet: () => {
      const set = container.repos.questionSets.findCurrent();
      return set
        ? {
            questionCount: set.questions.length,
            sourceTitle: `${set.set.source.spreadsheetTitle}／${set.set.source.sheetTitle}`,
          }
        : null;
    },
  });
  // 004：ActivityService 註冊題目開放／結束 hooks（參與組別、結果、事件）
  const activities = new ActivityService({
    machine,
    repo,
    submissions,
    results,
    monitor,
    events: container.repos.activityEvents,
    questionSets: container.repos.questionSets,
  });
  machine.hooks.onReset = () => submissions.clear();
  container.activityLock.bind(() => machine.activity?.phase ?? null);

  // 伺服器在作答中重啟：捨棄該題本輪送出並回到「等待開放」（002 FR-020a、004 FR-026）
  const notice = machine.recoverAfterRestart();
  if (notice) {
    container.logger.warn(notice);
    const activity = machine.activity!;
    container.repos.activityEvents.append({
      activityId: activity.id,
      at: new Date(),
      actorId: null,
      type: 'RESTART_CANCELLED',
      questionId: null,
      detail: notice,
    });
  }

  const viewFor: ViewFor = (student) => {
    const activity = machine.activity;
    const qid = activity?.currentQuestionId ?? null;
    // 作答中：記憶體中的送出；已結束：已寫入資料庫的有效送出（重啟後也能還原）
    const current =
      activity && activity.phase === 'CLOSED' && qid
        ? repo.listSubmissions(activity.id, qid)
        : submissions.all();
    return buildView({
      activity,
      question: qid ? repo.getQuestion(qid) : null,
      parts: qid ? repo.getQuestionParts(qid) : [],
      myTeam: student.teamId ? repo.getTeam(student.teamId) : null,
      teams: activity ? repo.listTeams(activity.id) : [],
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
    teacherView: () => monitor.build(),
  });
  monitor.online = () => realtime.onlineStudents();
  const ctx: AppContext = { config, repo, machine, submissions, viewFor, realtime, activities };
  machine.hooks.onChange = () => {
    realtime.pushAll();
    realtime.pushTeachers();
  };
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
