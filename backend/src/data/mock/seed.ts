import type { Activity } from '../../domain/buzzerTypes';
import type { Repository } from '../repositories';

/**
 * 虛構的 mock 搶答資料（002 FR-021；004 FR-032）：只供開發與測試建立活動，不在啟動時自動執行。
 * 第一場使用固定的活動 A1 與題目 Q1～Q3（002 的測試沿用）；之後的 mock 活動以時間戳區分。
 */
export const MOCK_ACTIVITY_ID = 'A1';

export const MOCK_QUESTIONS = [
  { questionId: 'Q1', number: 1, text: '請說明 TCP 三向交握的三個步驟。' },
  { questionId: 'Q2', number: 2, text: 'HTTP 狀態碼 404 與 500 分別代表什麼？' },
  { questionId: 'Q3', number: 3, text: '請舉一個「先寫測試再實作」的好處。' },
];

/** 建立一場 mock 活動（尚未交給狀態機）；呼叫端須確認沒有未結束的活動 */
export function createMockActivity(repo: Repository, now: number = Date.now()): Activity {
  const first = !repo.activityExists(MOCK_ACTIVITY_ID);
  const id = first ? MOCK_ACTIVITY_ID : `MOCK-${now}`;
  const activity: Activity = {
    id,
    phase: 'WAITING',
    currentQuestionId: null,
    openedAt: null,
    endsAt: null,
    startedAt: now,
    startedBy: null,
    endedAt: null,
    sourceTitle: '開發用 mock 題目',
    notice: null,
  };
  repo.createActivity(
    activity,
    MOCK_QUESTIONS.map((q) => ({
      questionId: first ? q.questionId : `${id}-${q.questionId}`,
      position: q.number,
      label: String(q.number),
      text: q.text,
      questionKey: null,
      kind: 'SINGLE' as const,
      stem: null,
      parts: [{ partIndex: 0, partLabel: null, questionText: q.text }],
    })),
  );
  return activity;
}
