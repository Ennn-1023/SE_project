import express, { Router } from 'express';
import type { Config } from './config/env.js';
import { GroupSettingsRepository } from './db/groupSettingsRepository.js';
import { SessionRepository } from './db/sessionRepository.js';
import { UserRepository } from './db/userRepository.js';
import type { PasswordHasher as PasswordHasherPort } from './domain/ports.js';
import type { Clock } from './lib/clock.js';
import { systemClock } from './lib/clock.js';
import type { Database } from './lib/db.js';
import { transaction } from './lib/db.js';
import { createLogger, type Logger } from './lib/logger.js';
import { PasswordHasher } from './lib/password.js';
import type { AppContext } from './context.js';
import { devResultsRouter, devTeacherRouter } from './http/routes/devTeacher.js';
import { studentRouter } from './http/routes/student.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireRole } from './middleware/requireRole.js';
import { requireJson } from './middleware/validate.js';
import { authRoutes } from './routes/authRoutes.js';
import { groupRoutes } from './routes/groupRoutes.js';
import { studentRoutes } from './routes/studentRoutes.js';
import { GroupService } from './services/groupService.js';
import { AccountService } from './services/accountService.js';
import { AuthService } from './services/authService.js';
import { SessionService } from './services/sessionService.js';

export interface AppDeps {
  config: Config;
  db: Database;
  clock?: Clock;
  hasher?: PasswordHasherPort;
  logger?: Logger;
}

/** 依組件圖組裝 repository 與 service。 */
export function createContainer(deps: AppDeps) {
  const clock = deps.clock ?? systemClock;
  const hasher = deps.hasher ?? new PasswordHasher();
  const logger = deps.logger ?? createLogger();
  const now = () => clock.now();
  const repos = {
    users: new UserRepository(deps.db, now),
    sessions: new SessionRepository(deps.db),
    groupSettings: new GroupSettingsRepository(deps.db),
  };
  const sessionService = new SessionService(repos.sessions, deps.config, clock);
  const services = {
    sessions: sessionService,
    auth: new AuthService(repos.users, sessionService, hasher, deps.config, clock),
    accounts: new AccountService(repos.users, sessionService, hasher, deps.config, clock),
    groups: new GroupService(repos.users, repos.groupSettings, clock, (fn) =>
      transaction(deps.db, fn),
    ),
  };
  const runInTransaction = <T>(fn: () => T): T => transaction(deps.db, fn);
  return {
    config: deps.config,
    db: deps.db,
    clock,
    hasher,
    logger,
    repos,
    services,
    runInTransaction,
  };
}

export type Container = ReturnType<typeof createContainer>;

export interface CreateAppOptions extends AppDeps {
  /** 已組裝的容器（server.ts 先建立容器以供 Socket.IO 驗證共用） */
  container?: Container;
  /** 搶答（002）的執行環境；提供時掛載 /api/student 與（啟用時）/api/dev */
  buzzer?: AppContext;
}

export function createApp(deps: CreateAppOptions) {
  const container = deps.container ?? createContainer(deps);
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', false);

  const api = Router();
  api.use(requireJson);
  api.use(express.json({ limit: '100kb' }));
  api.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  const { services, repos, config } = container;
  api.use(
    '/auth',
    authRoutes({ auth: services.auth, sessions: services.sessions, users: repos.users, config }),
  );
  api.use(
    '/students',
    studentRoutes({ accounts: services.accounts, sessions: services.sessions, users: repos.users }),
  );
  api.use(
    '/groups',
    groupRoutes({ groups: services.groups, sessions: services.sessions, users: repos.users }),
  );
  if (deps.buzzer) {
    const auth = requireAuth(services.sessions, repos.users);
    // 學生搶答 API：以 001 的 session 登入，只限學生
    api.use('/student', auth, requireRole('STUDENT'), studentRouter(deps.buzzer));
    if (config.enableDevTools) {
      // 模擬老師搶答操作（002 FR-022～FR-024），整合後須以老師身分登入
      api.use('/dev/teacher', auth, requireRole('TEACHER'), devTeacherRouter(deps.buzzer));
      api.use('/dev', auth, requireRole('TEACHER'), devResultsRouter(deps.buzzer));
    }
  }
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler(container.logger));
  return { app, container };
}
