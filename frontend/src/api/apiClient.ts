/** ApiClient（組件圖）：集中處理 fetch、JSON 與一致錯誤格式（contracts/openapi.yaml）。 */
import type {
  ResultBoardView,
  TeacherActivityView,
  WritebackConfirmBody,
  WritebackOutcomeView,
  WritebackPreviewView,
  AnnotationDocument,
  GridSnapshot,
  QuestionSetView,
  SheetSource,
  SheetTab,
  ValidationResult,
} from '@buzzer/shared';

// ---------- 003 題目匯入（specs/003-sheets-question-import/contracts/openapi.yaml） ----------

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  googleEmail?: string;
}

export interface ImportDraftView {
  id: string;
  revision: number;
  expiresAt: string;
  source: SheetSource;
  sheets: SheetTab[];
  grid: GridSnapshot;
  annotations: AnnotationDocument;
  restoredCount: number;
  validation: ValidationResult;
}

export interface SaveAnnotationsResult {
  revision: number;
  annotations: AnnotationDocument;
  validation: ValidationResult;
  expiresAt: string;
}

export interface PreviewResult {
  preview: QuestionSetView;
  replaces: { spreadsheetTitle: string; sheetTitle: string; questionCount: number } | null;
}

export type Role = 'TEACHER' | 'STUDENT';

export interface CurrentUser {
  account: string;
  displayName: string;
  role: Role;
  groupNumber?: number | null;
}

export interface StudentListItem {
  studentId: string;
  name: string;
  groupNumber: number | null;
  usingDefaultPassword: boolean;
}

export interface GroupMember {
  studentId: string;
  name: string;
}

export interface GroupSummary {
  groupNumber: number;
  members: GroupMember[];
  memberCount: number;
}

export interface GroupOverview {
  groupCount: number;
  groups: GroupSummary[];
  unassigned: GroupMember[];
}

export interface MyGroupView {
  groupNumber: number | null;
  groupCount: number;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
    readonly hint?: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** 收到 UNAUTHENTICATED 時派送的全域「未登入」事件。 */
export const UNAUTHENTICATED_EVENT = 'api:unauthenticated';
export const authEvents = new EventTarget();

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createApiClient(fetchImpl: FetchLike = (i, init) => fetch(i, init)) {
  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new ApiError(
        0,
        'NETWORK_ERROR',
        '無法連線到伺服器',
        undefined,
        '請確認網路連線後再試一次',
      );
    }
    if (res.status === 204) return undefined as T;
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      const e = (data as { error?: Record<string, unknown> } | null)?.error;
      const err = new ApiError(
        res.status,
        typeof e?.code === 'string' ? e.code : 'UNKNOWN_ERROR',
        typeof e?.message === 'string' ? e.message : '系統發生錯誤，請稍後再試',
        typeof e?.field === 'string' ? e.field : undefined,
        typeof e?.hint === 'string' ? e.hint : undefined,
        (e?.details as Record<string, unknown> | undefined) ?? undefined,
      );
      if (err.code === 'UNAUTHENTICATED') {
        authEvents.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
      }
      throw err;
    }
    return data as T;
  }

  return {
    request,
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    del: <T>(path: string) => request<T>('DELETE', path),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;

const client = createApiClient();

/** 各端點的型別化呼叫；頁面測試以 vi.spyOn(api, ...) 取代。 */
export const api = {
  login: (account: string, password: string) =>
    client.post<{ user: CurrentUser }>('/auth/login', { account, password }),
  logout: () => client.post<void>('/auth/logout'),
  me: () => client.get<{ user: CurrentUser }>('/auth/me'),
  changePassword: (currentPassword: string, newPassword: string, confirmPassword: string) =>
    client.post<void>('/auth/change-password', { currentPassword, newPassword, confirmPassword }),
  listStudents: () => client.get<{ students: StudentListItem[] }>('/students'),
  createStudent: (studentId: string, name: string) =>
    client.post<{ student: StudentListItem }>('/students', { studentId, name }),
  resetPassword: (studentId: string) =>
    client.post<void>(`/students/${encodeURIComponent(studentId)}/reset-password`),
  getGroupSettings: () => client.get<{ groupCount: number }>('/groups/settings'),
  setGroupCount: (groupCount: number) =>
    client.put<{ groupCount: number }>('/groups/settings', { groupCount }),
  groupOverview: () => client.get<GroupOverview>('/groups/overview'),
  myGroup: () => client.get<MyGroupView>('/groups/me'),
  selectGroup: (groupNumber: number) => client.post<MyGroupView>('/groups/me', { groupNumber }),
  assignGroup: (studentId: string, groupNumber: number | null) =>
    client.put<{ student: StudentListItem }>(
      `/groups/assignments/${encodeURIComponent(studentId)}`,
      {
        groupNumber,
      },
    ),
  // 003：Google 連結
  getGoogleStatus: () => client.get<GoogleStatus>('/google/status'),
  startGoogleAuth: () => client.post<{ authUrl: string }>('/google/oauth/start'),
  disconnectGoogle: () => client.del<void>('/google/connection'),
  // 003：學習單匯入
  createDraft: (link: string, sheetId?: number) =>
    client.post<{ draft: ImportDraftView }>(
      '/question-import/drafts',
      sheetId === undefined ? { link } : { link, sheetId },
    ),
  getCurrentDraft: () =>
    client.get<{ draft: ImportDraftView | null }>('/question-import/drafts/current'),
  saveAnnotations: (draftId: string, revision: number, annotations: AnnotationDocument) =>
    client.put<SaveAnnotationsResult>(
      `/question-import/drafts/${encodeURIComponent(draftId)}/annotations`,
      { revision, annotations },
    ),
  previewImport: (draftId: string) =>
    client.post<PreviewResult>(`/question-import/drafts/${encodeURIComponent(draftId)}/preview`),
  confirmImport: (draftId: string) =>
    client.post<{ questionSet: QuestionSetView }>(
      `/question-import/drafts/${encodeURIComponent(draftId)}/confirm`,
    ),
  cancelDraft: (draftId: string) =>
    client.del<void>(`/question-import/drafts/${encodeURIComponent(draftId)}`),
  // 003：目前題目集
  getQuestionSet: () => client.get<{ questionSet: QuestionSetView | null }>('/question-set'),
  clearQuestionSet: () => client.del<void>('/question-set'),
  reimportQuestionSet: () => client.post<{ draft: ImportDraftView }>('/question-set/reimport'),
  // 004：老師活動控制與監控（specs/004-activity-control-monitor/contracts/openapi.yaml）
  getActivity: () => client.get<TeacherActivityView>('/teacher/activity'),
  startActivity: () => client.post<TeacherActivityView>('/teacher/activity/start'),
  openQuestion: (questionId: string, seconds: number) =>
    client.post<TeacherActivityView>('/teacher/activity/open', { questionId, seconds }),
  reopenQuestion: (questionId: string, seconds: number) =>
    client.post<TeacherActivityView>('/teacher/activity/reopen', {
      questionId,
      seconds,
      confirm: true,
    }),
  closeQuestion: () => client.post<TeacherActivityView>('/teacher/activity/close'),
  backToWaiting: () => client.post<TeacherActivityView>('/teacher/activity/back-to-waiting'),
  endActivity: () => client.post<TeacherActivityView>('/teacher/activity/end'),
  getQuestionResult: (questionId: string) =>
    client.get<ResultBoardView>(
      `/teacher/activity/questions/${encodeURIComponent(questionId)}/result`,
    ),
  // 005：答案寫回 Google 試算表、匯出結果 CSV（specs/005-sheets-writeback-csv-export/contracts/openapi.yaml）
  writebackPreview: () => client.post<WritebackPreviewView>('/teacher/activity/writeback/preview'),
  writebackConfirm: (body: WritebackConfirmBody) =>
    client.post<WritebackOutcomeView>('/teacher/activity/writeback/confirm', body),
  downloadResultsCsv: () => downloadResultsCsv(),
};

/** 從 Content-Disposition 取出檔名（優先 filename*=UTF-8''…） */
export function filenameFromDisposition(header: string | null): string {
  const star = header ? /filename\*=UTF-8''([^;]+)/i.exec(header) : null;
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* 改用 ASCII 檔名 */
    }
  }
  const plain = header ? /filename="([^"]+)"/i.exec(header) : null;
  return plain?.[1] ?? 'activity-results.csv';
}

/**
 * 下載結果 CSV（005 research R11）：以 fetch 取得，成功時轉 Blob 觸發下載；
 * 失敗時解析一致的錯誤格式，讓畫面顯示原因而不是下載一份錯誤內容。回傳檔名。
 */
export async function downloadResultsCsv(
  fetchImpl: FetchLike = (i, init) => fetch(i, init),
): Promise<string> {
  let res: Response;
  try {
    res = await fetchImpl('/api/teacher/activity/export.csv', { credentials: 'same-origin' });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      '無法連線到伺服器',
      undefined,
      '請確認網路連線後再試一次',
    );
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: Record<string, unknown> } | null;
    const e = data?.error;
    const err = new ApiError(
      res.status,
      typeof e?.code === 'string' ? e.code : 'UNKNOWN_ERROR',
      typeof e?.message === 'string' ? e.message : '系統發生錯誤，請稍後再試',
      typeof e?.field === 'string' ? e.field : undefined,
      typeof e?.hint === 'string' ? e.hint : undefined,
    );
    if (err.code === 'UNAUTHENTICATED') authEvents.dispatchEvent(new Event(UNAUTHENTICATED_EVENT));
    throw err;
  }
  const filename = filenameFromDisposition(res.headers.get('Content-Disposition'));
  const url = URL.createObjectURL(await res.blob());
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return filename;
}
