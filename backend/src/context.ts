import type { StudentView } from '@buzzer/shared';
import type { Config } from './config/env';
import type { Repository } from './data/repositories';
import type { ActivityStateMachine } from './domain/activityStateMachine';
import type { SubmissionService } from './domain/submissionService';

/** 推播介面（realtime/socketServer.ts） */
export interface Realtime {
  pushToTeam(teamId: string): void;
  pushAll(): void;
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
}
