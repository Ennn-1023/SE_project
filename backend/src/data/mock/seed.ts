import type { Repository } from '../repositories';

/**
 * 虛構的 mock 搶答資料（002 FR-021）：1 場活動、3 題。
 * 題目匯入（F3）完成前以此提供題目；學生與組別改由 001 的帳號與組別管理建立，不再寫入 mock 學生。
 */
export const MOCK_ACTIVITY_ID = 'A1';

export const MOCK_QUESTIONS = [
  { questionId: 'Q1', number: 1, text: '請說明 TCP 三向交握的三個步驟。' },
  { questionId: 'Q2', number: 2, text: 'HTTP 狀態碼 404 與 500 分別代表什麼？' },
  { questionId: 'Q3', number: 3, text: '請舉一個「先寫測試再實作」的好處。' },
];

/** 寫入 mock 活動與題目；已存在時不重複寫入 */
export function seedMockData(repo: Repository): void {
  if (repo.getCurrentActivity()) return;
  repo.saveActivity({
    id: MOCK_ACTIVITY_ID,
    phase: 'WAITING',
    currentQuestionId: null,
    endsAt: null,
  });
  for (const q of MOCK_QUESTIONS) repo.insertQuestion({ ...q, activityId: MOCK_ACTIVITY_ID });
}
