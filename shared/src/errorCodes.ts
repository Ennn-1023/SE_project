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
      `目前階段（${PHASE_LABEL[String(p.phase)] ?? p.phase}）不能執行「${p.action ?? '此操作'}」`,
    hint: (p) => (p.allowed ? `只有在「${p.allowed}」階段可以執行` : '請確認目前的活動階段'),
  },
  QUESTION_ALREADY_CLOSED: {
    status: 409,
    message: () => '此題已結束，不能再次開放',
    hint: () => '請選擇其他題目',
  },
  INVALID_SECONDS: {
    status: 400,
    message: () => '作答秒數必須是 5–600 的整數',
    hint: () => '例如 60',
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
