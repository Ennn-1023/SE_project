/** ApiClient（組件圖）：集中處理 fetch、JSON 與一致錯誤格式（contracts/openapi.yaml）。 */

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
};
