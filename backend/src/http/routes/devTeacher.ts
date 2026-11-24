import { Router } from 'express';
import { z } from 'zod';
import type { QuestionResultDto } from '@buzzer/shared';
import type { AppContext } from '../../context';
import { createMockActivity } from '../../data/mock/seed';
import { AppError, parseOrThrow } from '../errors';

const openSchema = z.object({
  questionId: z.string().trim().min(1, { error: '不可為空' }).max(64, { error: '最多 64 字元' }),
  seconds: z.unknown().optional(),
});

/** dev 專用模擬老師操作（002 FR-022、FR-023；004 FR-032）；只在 ENABLE_DEV_TOOLS=true 時掛載 */
export function devTeacherRouter(ctx: AppContext): Router {
  const r = Router();
  const { machine } = ctx;

  r.get('/status', (_req, res) => {
    const activity = machine.activity;
    const questions = activity
      ? ctx.repo
          .listQuestions(activity.id)
          .map(({ questionId, number, text }) => ({ questionId, number, text }))
      : [];
    res.json({ ...machine.status(), questions });
  });

  /** 以 mock 題目開始一場活動（取代 002 啟動時的自動 seed） */
  r.post('/mock-activity', (_req, res) => {
    if (ctx.repo.hasRunningActivity()) throw new AppError('ACTIVITY_ALREADY_RUNNING');
    machine.start(createMockActivity(ctx.repo));
    res.json(machine.status());
  });

  r.post('/open', (req, res) => {
    const body = parseOrThrow(openSchema, req.body ?? {});
    if (body.seconds !== undefined && typeof body.seconds !== 'number') {
      throw new AppError('INVALID_SECONDS', 'seconds');
    }
    machine.open(body.questionId, body.seconds as number | undefined);
    res.json(machine.status());
  });

  r.post('/time-up', (_req, res) => {
    machine.timeUp();
    res.json(machine.status());
  });

  r.post('/close', (_req, res) => {
    machine.manualClose();
    res.json(machine.status());
  });

  r.post('/back-to-waiting', (_req, res) => {
    machine.backToWaiting();
    res.json(machine.status());
  });

  r.post('/end', (_req, res) => {
    machine.end();
    res.json(machine.status());
  });

  r.post('/reset', (_req, res) => {
    machine.reset();
    res.json(machine.status());
  });

  return r;
}

const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString());

const submissionsQuery = z.object({
  questionId: z.string().trim().min(1, { error: '不可為空' }).max(64, { error: '最多 64 字元' }),
});

/** dev 專用：讀取有效結果與送出紀錄（002 FR-019、FR-020）；不對學生開放 */
export function devResultsRouter(ctx: AppContext): Router {
  const r = Router();
  const activityId = () => ctx.machine.activity?.id ?? '';

  r.get('/results', (_req, res) => {
    const list: QuestionResultDto[] = ctx.repo.listResults(activityId()).map((x) => ({
      question_id: x.questionId,
      answer: x.answer,
      winner_team: x.winnerTeam,
      submitted_at: iso(x.submittedAt),
    }));
    res.json(list);
  });

  r.get('/submissions', (req, res) => {
    const { questionId } = parseOrThrow(submissionsQuery, req.query);
    res.json(
      ctx.repo.listSubmissions(activityId(), questionId).map((s) => ({
        question_id: s.questionId,
        team_id: s.teamId,
        student_id: s.studentId,
        answer: s.answer,
        received_at: iso(s.receivedAt),
        rank: s.rank,
      })),
    );
  });

  return r;
}
