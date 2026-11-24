/**
 * 004 活動管理與老師監控的整合測試 helper（tasks.md T003）。
 * 以 startTestServer 啟動完整伺服器（不自動建立 mock 活動），直接寫入虛構的題目集，
 * 並提供老師 REST 操作與 /teacher socket。
 */
import { io, type Socket } from 'socket.io-client';
import type request from 'supertest';
import type { TeacherActivityView } from '@buzzer/shared';
import type { QuestionSetRecord } from '../../src/domain/questionTypes';
import { startTestServer, type SessionCookie, type TestServer } from './testServer';

/** 虛構題目集：第 1 題單題、第 2 題題組（共同題幹＋2 小題）、第 3 題單題 */
export function sampleQuestionSet(questionCount = 3): QuestionSetRecord {
  const questions: QuestionSetRecord['questions'] = [];
  for (let i = 1; i <= questionCount; i++) {
    const group = i === 2;
    questions.push({
      position: i,
      questionKey: `qk${String(i).padStart(4, '0')}`,
      label: String(i),
      kind: group ? 'GROUP' : 'SINGLE',
      stemText: group ? '閱讀下列敘述後回答。' : null,
      stemCell: group ? 'C9' : null,
      slots: group
        ? [
            { partIndex: 0, partLabel: '（1）', questionText: '小題一的題目', questionCell: 'C10', answerCell: 'H10', answerHadContent: false },
            { partIndex: 1, partLabel: '（2）', questionText: '小題二的題目', questionCell: 'C11', answerCell: 'H11', answerHadContent: false },
          ]
        : [
            {
              partIndex: 0,
              partLabel: null,
              questionText: `第 ${i} 題的題目文字`,
              questionCell: `C${i * 5}`,
              answerCell: `G${i * 5}`,
              answerHadContent: false,
            },
          ],
    });
  }
  return {
    set: {
      source: {
        spreadsheetId: 'x'.repeat(30),
        spreadsheetTitle: '測試學習單',
        sheetId: 0,
        sheetTitle: '學習單',
        sourceUrl: 'https://docs.google.com/spreadsheets/d/xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx/edit',
      },
      questionCount: questions.length,
      slotCount: questions.reduce((n, q) => n + q.slots.length, 0),
      importedAt: new Date('2026-11-24T00:00:00Z'),
      importedBy: 1,
      draftId: `draft-${questionCount}`,
    },
    questions,
  };
}

export interface TeacherClient {
  socket: Socket;
  views: TeacherActivityView[];
  waitFor(pred: (v: TeacherActivityView) => boolean, timeoutMs?: number): Promise<TeacherActivityView>;
  last(): TeacherActivityView | undefined;
}

export interface ActivityTestServer extends TestServer {
  api: {
    get(cookie?: SessionCookie): Promise<request.Response>;
    start(cookie?: SessionCookie): Promise<request.Response>;
    open(questionId: string, seconds?: unknown, cookie?: SessionCookie): Promise<request.Response>;
    reopen(questionId: string, seconds?: unknown, confirm?: unknown): Promise<request.Response>;
    close(cookie?: SessionCookie): Promise<request.Response>;
    back(): Promise<request.Response>;
    end(): Promise<request.Response>;
    result(questionId: string): Promise<request.Response>;
  };
  /** 寫入虛構題目集（取代目前題目集） */
  seedQuestionSet(record?: QuestionSetRecord): void;
  /** 開始活動並回傳 activity id；第 n 題的 questionId 為 `${id}-${n}` */
  startActivity(): Promise<string>;
  connectTeacher(cookie?: SessionCookie): Promise<TeacherClient>;
  submitAnswers(cookie: SessionCookie, questionId: string, answers: unknown[]): Promise<request.Response>;
}

/** 啟動伺服器（不建立 mock 活動），預設寫入 3 題的虛構題目集 */
export async function startActivityServer(
  options: { seed?: boolean; env?: Record<string, string> } = {},
): Promise<ActivityTestServer> {
  const ts = await startTestServer(options.env ?? {}, { mockActivity: false });
  const sockets: Socket[] = [];
  const as = (cookie?: SessionCookie) => cookie ?? ts.teacherCookie;
  const post = (path: string, body: object = {}, cookie?: SessionCookie) =>
    ts.http.post(`/api/teacher/activity${path}`).set('Cookie', as(cookie)).send(body);

  const server: ActivityTestServer = {
    ...ts,
    api: {
      get: (cookie) => ts.http.get('/api/teacher/activity').set('Cookie', as(cookie)),
      start: (cookie) => post('/start', {}, cookie),
      open: (questionId, seconds, cookie) =>
        post('/open', seconds === undefined ? { questionId } : { questionId, seconds }, cookie),
      reopen: (questionId, seconds, confirm) => {
        const body: Record<string, unknown> = { questionId };
        if (seconds !== undefined) body.seconds = seconds;
        if (confirm !== undefined) body.confirm = confirm;
        return post('/reopen', body);
      },
      close: (cookie) => post('/close', {}, cookie),
      back: () => post('/back-to-waiting'),
      end: () => post('/end'),
      result: (questionId) =>
        ts.http
          .get(`/api/teacher/activity/questions/${encodeURIComponent(questionId)}/result`)
          .set('Cookie', ts.teacherCookie),
    },
    seedQuestionSet(record = sampleQuestionSet()) {
      ts.server.container.repos.questionSets.replace(record);
    },
    async startActivity() {
      const res = await post('/start');
      if (res.status !== 200) throw new Error(`start failed: ${res.status} ${JSON.stringify(res.body)}`);
      return (res.body as TeacherActivityView).activity!.id;
    },
    connectTeacher(cookie) {
      return new Promise((resolve, reject) => {
        const socket = io(`${ts.url}/teacher`, {
          extraHeaders: { Cookie: as(cookie) },
          transports: ['websocket'],
          forceNew: true,
          reconnection: false,
        });
        sockets.push(socket);
        const views: TeacherActivityView[] = [];
        const waiters: Array<{ pred: (v: TeacherActivityView) => boolean; resolve: (v: TeacherActivityView) => void }> = [];
        socket.on('teacher:update', (v: TeacherActivityView) => {
          views.push(v);
          for (const w of [...waiters]) {
            if (w.pred(v)) {
              waiters.splice(waiters.indexOf(w), 1);
              w.resolve(v);
            }
          }
        });
        const client: TeacherClient = {
          socket,
          views,
          last: () => views[views.length - 1],
          waitFor(pred, timeoutMs = 3000) {
            const existing = [...views].reverse().find(pred);
            if (existing) return Promise.resolve(existing);
            return new Promise((res, rej) => {
              const t = setTimeout(() => rej(new Error('waitFor teacher:update timeout')), timeoutMs);
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
    submitAnswers: (cookie, questionId, answers) =>
      ts.http.post('/api/student/submissions').set('Cookie', cookie).send({ questionId, answers }),
    async stop() {
      for (const s of sockets) s.disconnect();
      await ts.stop();
    },
  };
  if (options.seed !== false) server.seedQuestionSet();
  return server;
}
