import type { StudentView } from '@buzzer/shared';
import type { Config } from './config/env';
import type { Repository } from './data/repositories';
import type { ActivityStateMachine } from './domain/activityStateMachine';
import type { SubmissionService } from './domain/submissionService';
import type { ActivityService } from './services/activityService';
import type { CsvExportService } from './services/csvExportService';
import type { WritebackService } from './services/writebackService';

/** 推播介面（realtime/socketServer.ts） */
export interface Realtime {
  pushToTeam(teamId: string): void;
  pushAll(): void;
  /** 推送 TeacherActivityView 給所有老師連線（004） */
  pushTeachers(): void;
  /** 目前至少有一個 /student 連線的學號（004 FR-022） */
  onlineStudents(): ReadonlySet<string>;
  close(): Promise<void>;
}

/** 依學生產生視角的函式（domain/visibilityFilter.ts） */
export type ViewFor = (student: { studentId: string; teamId: string | null }) => StudentView;

export interface AppContext {
  config: Config;
  repo: Repository;
  machine: ActivityStateMachine;
  submissions: SubmissionService;
  viewFor: ViewFor;
  realtime: Realtime;
  /** 老師活動控制（004） */
  activities: ActivityService;
  /** 答案寫回 Google 試算表（005） */
  writeback: WritebackService;
  /** 活動結果匯出 CSV（005） */
  csvExport: CsvExportService;
}
