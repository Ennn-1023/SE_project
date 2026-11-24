/**
 * 錯誤碼表（contracts/rest-api.md）。message 與 hint 可依參數產生。
 */
export type ErrorParams = Record<string, string | number | undefined>;

interface ErrorDef {
  status: number;
  message: (p: ErrorParams) => string;
  hint: (p: ErrorParams) => string;
}

const PHASE_LABEL: Record<string, string> = {
  NONE: '尚未開始活動',
  NO_ACTIVITY: '尚未開始活動',
  WAITING: '等待開放',
  ANSWERING: '作答中',
  CLOSED: '已結束',
  ENDED: '活動結束',
};

export const ERROR_DEFS = {
  VALIDATION_ERROR: {
    status: 400,
    message: (p) => p.message?.toString() ?? `${p.field ?? '輸入'} 格式不正確`,
    hint: (p) => p.hint?.toString() ?? '請確認欄位內容後再試一次',
  },
  EMPTY_ANSWER: {
    status: 400,
    message: () => '答案不可為空',
    hint: () => '請輸入內容後再送出',
  },
  ANSWER_TOO_LONG: {
    status: 400,
    message: (p) => `答案最多 500 字，目前 ${p.length ?? '?'} 字`,
    hint: () => '請精簡後再送出',
  },
  UNAUTHORIZED: {
    status: 401,
    message: () => '尚未登入或登入已過期',
    hint: () => '請重新登入',
  },
  FORBIDDEN: {
    status: 403,
    message: () => '權限不足',
    hint: () => '此功能僅限老師使用',
  },
  NO_TEAM: {
    status: 403,
    message: () => '你尚未被分配到組別',
    hint: () => '請聯絡老師',
  },
  QUESTION_NOT_FOUND: {
    status: 404,
    message: () => '找不到此題目',
    hint: () => '請確認題目編號',
  },
  NOT_FOUND: {
    status: 404,
    message: () => '找不到此路徑',
    hint: () => '請確認網址是否正確',
  },
  QUESTION_NOT_OPEN: {
    status: 409,
    message: () => '此題目目前未開放作答',
    hint: () => '請等待老師開放題目',
  },
  QUESTION_CLOSED: {
    status: 409,
    message: () => '本題搶答已結束，無法再送出答案',
    hint: () => '請查看本題結果',
  },
  ALREADY_SUBMITTED: {
    status: 409,
    message: () => '本組已送出過此題答案，每組每題只能送出一次',
    hint: () => '送出後不可修改',
  },
  ACTIVITY_ENDED: {
    status: 409,
    message: () => '活動已結束',
    hint: () => '感謝參與',
  },
  INVALID_TRANSITION: {
    status: 409,
    message: (p) =>
      p.message?.toString() ??
      `目前階段（${PHASE_LABEL[String(p.phase)] ?? p.phase}）不能執行「${p.action ?? '此操作'}」`,
    hint: (p) =>
      p.hint?.toString() ??
      (p.allowed ? `只有在「${p.allowed}」階段可以執行` : '請確認目前的活動階段'),
  },
  QUESTION_ALREADY_CLOSED: {
    status: 409,
    message: (p) => `${p.label ? `第 ${p.label} 題` : '此題'}已結束`,
    hint: () => '如需讓各組重答，請使用「重新開放」',
  },
  INVALID_SECONDS: {
    status: 400,
    message: () => '作答秒數須為 5～600 的整數',
    hint: () => '例如 60',
  },
  // ---------- 004 活動管理與老師監控（specs/004-activity-control-monitor/contracts/openapi.yaml） ----------
  NO_ACTIVITY: {
    status: 409,
    message: () => '目前沒有進行中的活動',
    hint: () => '請等待老師開始活動',
  },
  ACTIVITY_ALREADY_RUNNING: {
    status: 409,
    message: () => '已有進行中的活動',
    hint: () => '請先結束目前活動，再開始新活動',
  },
  NO_QUESTION_SET: {
    status: 409,
    message: () => '尚未匯入題目',
    hint: () => '請先到題目管理匯入學習單',
  },
  NO_TEAM_MEMBERS: {
    status: 409,
    message: () => '尚無任何組別有學生',
    hint: () => '請先到組別管理分組',
  },
  QUESTION_NOT_CLOSED: {
    status: 409,
    message: () => '只有已結束的題目可以重新開放或查看結果',
    hint: () => '請先結束這一題',
  },
  REOPEN_NOT_CONFIRMED: {
    status: 409,
    message: () => '重新開放會取代本題目前的結果',
    hint: () => '請在確認視窗按「確定重新開放」後再送出',
  },
  QUESTION_SET_LOCKED: {
    status: 409,
    message: () => '搶答活動進行中，無法變更題目集',
    hint: () => '請先結束活動',
  },
  GROUP_CHANGE_LOCKED: {
    status: 409,
    message: () => '搶答作答中，無法調整組別',
    hint: () => '請於本題結束後再調整組別',
  },
  PART_ANSWER_EMPTY: {
    status: 400,
    message: (p) => `${p.label ?? '答案'}答案不可為空`,
    hint: () => '請輸入內容後再送出',
  },
  PART_ANSWER_TOO_LONG: {
    status: 400,
    message: (p) => `${p.label ?? '答案'}答案最多 500 字，目前 ${p.length ?? '?'} 字`,
    hint: () => '請精簡後再送出',
  },
  PART_COUNT_MISMATCH: {
    status: 400,
    message: (p) => `答案數量（${p.actual ?? '?'}）與小題數（${p.expected ?? '?'}）不符`,
    hint: () => '請重新整理頁面後再作答',
  },
  INTERNAL_ERROR: {
    status: 500,
    message: () => '系統發生錯誤，請稍後再試',
    hint: () => '若持續發生請通知老師',
  },
} satisfies Record<string, ErrorDef>;

export type ErrorCode = keyof typeof ERROR_DEFS;

export function describeError(code: ErrorCode, params: ErrorParams = {}) {
  const def: ErrorDef = ERROR_DEFS[code];
  return { status: def.status, message: def.message(params), hint: def.hint(params) };
}

export function phaseLabel(phase: string): string {
  return PHASE_LABEL[phase] ?? phase;
}
