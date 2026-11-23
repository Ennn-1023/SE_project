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
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
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

export function createApp(deps: AppDeps) {
  const container = createContainer(deps);
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
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler(container.logger));
  return { app, container };
}
