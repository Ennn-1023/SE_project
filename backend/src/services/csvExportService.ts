/**
 * CsvExportService（005 組件圖、diagrams/005-sequence-export.puml、data-model.md §4）：
 * 匯出最近一場活動的結果 CSV。以組別識別，不含學生姓名、學號或帳號（FR-017、Clarifications Q4）。
 * 不需要 Google 帳號連結（FR-023）。
 */
import { CSV_HEADERS } from '@buzzer/shared';
import { groupNumberOf, teamNameOf } from '../data/repositories.js';
import type { ExportEventRepository } from '../db/exportEventRepository.js';
import type { Clock } from '../lib/clock.js';
import { appError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { ActivityResultReader, QuestionOutcome } from './activityResultReader.js';
import { CsvEncoder } from './csvEncoder.js';

/** data-model.md §4 題目狀態 */
export type CsvQuestionStatus = 'CLOSED' | 'ANSWERING' | 'NOT_OPENED';

/** data-model.md §4 CSV 結果列（不含送出者） */
export interface CsvResultRow {
  questionNumber: string;
  /** 題組小題標籤；單題為空字串 */
  partLabel: string;
  status: CsvQuestionStatus;
  /** 作答中／未開放列為空字串 */
  teamName: string;
  /** 已送出為順位；未送出為「未送出」；作答中／未開放列為 null */
  rank: number | '未送出' | null;
  /** 作答中／未開放列為 null */
  isWinner: boolean | null;
  /** 距題目開放的秒數；未送出或無法得知時為 null */
  elapsedSeconds: number | null;
  answer: string | null;
}

export interface CsvFile {
  filename: string;
  content: string;
  rows: number;
}

export interface CsvExportServiceDeps {
  reader: ActivityResultReader;
  events: ExportEventRepository;
  clock: Clock;
  logger: Logger;
}

const STATUS_TEXT: Record<CsvQuestionStatus, string> = {
  CLOSED: '已結束',
  ANSWERING: '作答中',
  NOT_OPENED: '未開放',
};

const pad = (n: number) => String(n).padStart(2, '0');

/** 檔名：搶答結果_YYYYMMDD-HHmm.csv（活動開始時間，伺服器本地時區；FR-022） */
export function csvFilename(startedAt: number): string {
  const d = new Date(startedAt);
  return `搶答結果_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.csv`;
}

export class CsvExportService {
  constructor(private readonly deps: CsvExportServiceDeps) {}

  export(teacherId: number): CsvFile {
    const { reader, events, clock, logger } = this.deps;
    const activity = reader.latestActivity();
    if (!activity) throw appError('NO_ACTIVITY_RESULTS');
    const rows = this.buildRows(reader.validResults(activity.id));
    const content = CsvEncoder.encode(
      CSV_HEADERS,
      rows.map((r) => [
        r.questionNumber,
        r.partLabel,
        STATUS_TEXT[r.status],
        r.teamName,
        r.rank === null ? '' : String(r.rank),
        r.isWinner === null ? '' : r.isWinner ? '是' : '否',
        r.elapsedSeconds === null ? '' : r.elapsedSeconds.toFixed(1),
        r.answer ?? '',
      ]),
    );
    // 送出前記錄（只記列數，不含答案；FR-025）
    events.record({
      at: clock.now(),
      actorId: teacherId,
      activityId: activity.id,
      type: 'CSV_EXPORTED',
      spreadsheetId: null,
      written: 0,
      overwritten: 0,
      skipped: 0,
      rows: rows.length,
      failureCode: null,
    });
    logger.info('csv exported', { activityId: activity.id, rows: rows.length });
    return {
      filename: csvFilename(activity.startedAt ?? clock.now().getTime()),
      content,
      rows: rows.length,
    };
  }

  /**
   * 已結束題目：每個參與組別 × 每個小題一列，依順位（未送出排最後、依組號）再依小題排序；
   * 作答中與未開放題目各一列（FR-018）。
   */
  buildRows(outcomes: QuestionOutcome[]): CsvResultRow[] {
    const rows: CsvResultRow[] = [];
    for (const o of [...outcomes].sort((a, b) => a.position - b.position)) {
      if (o.status !== 'CLOSED') {
        rows.push({
          questionNumber: o.label,
          partLabel: '',
          status: o.status,
          teamName: '',
          rank: null,
          isWinner: null,
          elapsedSeconds: null,
          answer: null,
        });
        continue;
      }
      const submitted = new Map(o.submissions.map((s) => [s.teamId, s]));
      const teamNames = new Map(o.teams.map((t) => [t.teamId, t]));
      const submittedTeams = o.submissions.map((s) => s.teamId);
      const waitingTeams = o.teams
        .filter((t) => !submitted.has(t.teamId))
        .sort((a, b) => a.groupNumber - b.groupNumber)
        .map((t) => t.teamId);
      for (const teamId of [...submittedTeams, ...waitingTeams]) {
        const s = submitted.get(teamId);
        const teamName = teamNames.get(teamId)?.teamName ?? teamNameOf(groupNumberOf(teamId) ?? 0);
        for (const part of o.parts) {
          rows.push({
            questionNumber: o.label,
            partLabel: o.kind === 'GROUP' ? (part.partLabel ?? '') : '',
            status: 'CLOSED',
            teamName,
            rank: s ? s.rank : '未送出',
            isWinner: !!s && o.winner?.teamId === teamId,
            elapsedSeconds:
              s && o.openedAt !== null
                ? Math.round(Math.max(0, s.receivedAt - o.openedAt) / 100) / 10
                : null,
            answer: s
              ? (s.answers.find((a) => a.partIndex === part.partIndex)?.answer ?? '')
              : null,
          });
        }
      }
    }
    return rows;
  }
}
