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
import { GoogleConnectionRepository } from './db/googleConnectionRepository.js';
import { ImportDraftRepository } from './db/importDraftRepository.js';
import { OAuthStateRepository } from './db/oauthStateRepository.js';
import { QuestionEventRepository } from './db/questionEventRepository.js';
import { QuestionSetRepository } from './db/questionSetRepository.js';
import { AnnotationCodec } from './domain/annotationCodec.js';
import type {
  GoogleOAuthClient as GoogleOAuthClientPort,
  SheetsGateway as SheetsGatewayPort,
} from './domain/questionPorts.js';
import { GoogleOAuthClient } from './integrations/google/googleOAuthClient.js';
import { SheetsGateway } from './integrations/google/sheetsGateway.js';
import { TokenCipher } from './lib/tokenCipher.js';
import { googleRoutes } from './routes/googleRoutes.js';
import { questionImportRoutes } from './routes/questionImportRoutes.js';
import { questionSetRoutes } from './routes/questionSetRoutes.js';
import { GoogleAuthService } from './services/googleAuthService.js';
import { QuestionImportService } from './services/questionImportService.js';
import { QuestionSetService } from './services/questionSetService.js';
import { ActivityLockGuard } from './services/activityLockGuard.js';
import { ActivityEventRepository } from './db/activityEventRepository.js';
import { activityRoutes } from './routes/activityRoutes.js';
import { SheetsService } from './services/sheetsService.js';
import { ExportEventRepository } from './db/exportEventRepository.js';
import { WritebackTargetRepository } from './db/writebackTargetRepository.js';
import { resultExportRoutes } from './routes/resultExportRoutes.js';

export interface AppDeps {
  config: Config;
  db: Database;
  clock?: Clock;
  hasher?: PasswordHasherPort;
  logger?: Logger;
  /** Google 外部整合；測試注入 FakeGoogle，未提供時依 config.google 建立真實的 HTTP 實作（003） */
  google?: { oauth: GoogleOAuthClientPort; sheets: SheetsGatewayPort };
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
    googleConnections: new GoogleConnectionRepository(deps.db),
    oauthStates: new OAuthStateRepository(deps.db),
    importDrafts: new ImportDraftRepository(deps.db),
    questionSets: new QuestionSetRepository(deps.db),
    questionEvents: new QuestionEventRepository(deps.db),
    activityEvents: new ActivityEventRepository(deps.db),
  };
  // 004：活動進行中鎖定題目集、作答中鎖定組別；startServer 建立狀態機後才綁定（research.md R8）
  const activityLock = new ActivityLockGuard();
  const sessionService = new SessionService(repos.sessions, deps.config, clock);
  const runInTransaction = <T>(fn: () => T): T => transaction(deps.db, fn);

  // 003 Google 試算表串接（組件圖 003-component）；config.google 為 null 時功能停用
  const googleConfig = deps.config.google;
  const oauthClient =
    deps.google?.oauth ?? (googleConfig ? new GoogleOAuthClient(googleConfig) : null);
  const sheetsGateway = deps.google?.sheets ?? new SheetsGateway();
  const googleAuth = new GoogleAuthService({
    config: googleConfig,
    oauth: googleConfig ? oauthClient : null,
    cipher: googleConfig ? new TokenCipher(googleConfig.encryptionKey) : null,
    connections: repos.googleConnections,
    states: repos.oauthStates,
    events: repos.questionEvents,
    clock,
    logger,
  });
  const codec = new AnnotationCodec();
  // 005：寫回目標與寫回／匯出紀錄
  const writebackTargets = new WritebackTargetRepository(deps.db);
  const exportEvents = new ExportEventRepository(deps.db);
  // F10 用：依標註取得每個作答格目前的位置
  const sheets = new SheetsService(googleAuth, sheetsGateway, logger, (entries, grid) =>
    codec
      .decode(entries, grid)
      .doc.questions.flatMap((q) =>
        q.parts.flatMap((p, partIndex) =>
          p.answerCell ? [{ questionKey: q.key, partIndex, answerCell: p.answerCell }] : [],
        ),
      ),
  );
  const questionImport = new QuestionImportService({
    sheets,
    codec,
    drafts: repos.importDrafts,
    sets: repos.questionSets,
    events: repos.questionEvents,
    clock,
    logger,
    runInTransaction,
    lock: activityLock,
  });
  const questionSets = new QuestionSetService({
    sets: repos.questionSets,
    events: repos.questionEvents,
    imports: questionImport,
    clock,
    lock: activityLock,
  });
  const services = {
    sessions: sessionService,
    auth: new AuthService(repos.users, sessionService, hasher, deps.config, clock),
    accounts: new AccountService(repos.users, sessionService, hasher, deps.config, clock),
    groups: new GroupService(
      repos.users,
      repos.groupSettings,
      clock,
      (fn) => transaction(deps.db, fn),
      activityLock,
    ),
    googleAuth,
    sheets,
    questionImport,
    questionSets,
  };
  return {
    config: deps.config,
    db: deps.db,
    clock,
    codec,
    hasher,
    logger,
    repos: { ...repos, writebackTargets, exportEvents },
    services,
    activityLock,
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
  // 標註文件最多 200 題 × 10 小題，允許較大的請求（plan.md 實作要點 5）；其餘 API 維持 100 KB
  api.use('/question-import', express.json({ limit: '1mb' }));
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
  api.use(
    '/google',
    googleRoutes({ google: services.googleAuth, sessions: services.sessions, users: repos.users }),
  );
  api.use(
    '/question-import',
    questionImportRoutes({
      imports: services.questionImport,
      sessions: services.sessions,
      users: repos.users,
    }),
  );
  api.use(
    '/question-set',
    questionSetRoutes({
      questionSets: services.questionSets,
      sessions: services.sessions,
      users: repos.users,
    }),
  );
  if (deps.buzzer) {
    const auth = requireAuth(services.sessions, repos.users);
    // 學生搶答 API：以 001 的 session 登入，只限學生
    api.use('/student', auth, requireRole('STUDENT'), studentRouter(deps.buzzer));
    // 答案寫回與結果匯出（005 contracts/openapi.yaml；與 004 共用 /teacher/activity 前綴）
    api.use(
      '/teacher/activity',
      resultExportRoutes({
        writeback: deps.buzzer.writeback,
        csv: deps.buzzer.csvExport,
        sessions: services.sessions,
        users: repos.users,
      }),
    );
    // 老師活動控制與監控（004 contracts/openapi.yaml）
    api.use(
      '/teacher/activity',
      activityRoutes({
        activities: deps.buzzer.activities,
        sessions: services.sessions,
        users: repos.users,
      }),
    );
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
