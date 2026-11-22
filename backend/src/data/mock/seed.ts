import type { Repository } from '../repositories';

/**
 * 虛構的 mock 資料（FR-021）：1 場活動、3 題、4 組。
 * 每組 1 位代表；第 1 組另有第 2 位學生（測試同組重複送出）；S900 未分組。
 */
export const MOCK_ACTIVITY_ID = 'A1';

export const MOCK_QUESTIONS = [
  { questionId: 'Q1', number: 1, text: '請說明 TCP 三向交握的三個步驟。' },
  { questionId: 'Q2', number: 2, text: 'HTTP 狀態碼 404 與 500 分別代表什麼？' },
  { questionId: 'Q3', number: 3, text: '請舉一個「先寫測試再實作」的好處。' },
];

export const MOCK_TEAMS = [
  { teamId: 'T1', name: '第 1 組' },
  { teamId: 'T2', name: '第 2 組' },
  { teamId: 'T3', name: '第 3 組' },
  { teamId: 'T4', name: '第 4 組' },
];

export const MOCK_STUDENTS = [
  { studentId: 'S101', name: '王小明', teamId: 'T1' },
  { studentId: 'S102', name: '李小華', teamId: 'T1' },
  { studentId: 'S201', name: '陳大文', teamId: 'T2' },
  { studentId: 'S301', name: '林美玲', teamId: 'T3' },
  { studentId: 'S401', name: '張志強', teamId: 'T4' },
  { studentId: 'S900', name: '黃未分', teamId: null },
];

/** 寫入 mock 資料；已存在時不重複寫入 */
export function seedMockData(repo: Repository): void {
  if (repo.getCurrentActivity()) return;
  repo.saveActivity({ id: MOCK_ACTIVITY_ID, phase: 'WAITING', currentQuestionId: null, endsAt: null });
  for (const q of MOCK_QUESTIONS) repo.insertQuestion({ ...q, activityId: MOCK_ACTIVITY_ID });
  for (const t of MOCK_TEAMS) repo.insertTeam({ ...t, activityId: MOCK_ACTIVITY_ID });
  for (const s of MOCK_STUDENTS) repo.insertStudent(s);
}
