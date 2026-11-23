/**
 * FakeGoogle（research R11）：記憶體模擬的 Google OAuth 與 Sheets API，同時實作
 * GoogleOAuthClient 與 SheetsGateway。不連線真實 Google、不使用真實憑證。
 *
 * - developer metadata 附在列／欄／分頁上；insertRows／deleteRows／insertColumns／deleteColumns
 *   依 Google 規則移動或刪除 metadata、合併範圍與隱藏列欄（research R3）。
 * - 所有 token、授權碼皆為隨機產生的假值。
 */
import { createHash, randomBytes } from 'node:crypto';
import { parseCellRef, toCellRef, type GridSnapshot, type MergeRange } from '@buzzer/shared';
import type {
  CellUpdate,
  GoogleOAuthClient,
  MetadataEntry,
  SheetBatchRequest,
  SheetsGateway,
  SpreadsheetInfo,
  TokenSet,
  UsedRange,
} from '../../src/domain/questionPorts.js';
import { GoogleHttpError } from '../../src/integrations/google/googleHttp.js';

export const SPREADSHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const FULL_SCOPE = `openid email ${SPREADSHEETS_SCOPE}`;

export interface FakeCell {
  text: string;
  error?: boolean;
}

export interface FakeSheetInit {
  sheetId: number;
  title: string;
  /** A1 → 文字（`#REF!` 等以 error: true 表示） */
  cells: Record<string, string | FakeCell>;
  merges?: MergeRange[];
  hiddenRows?: number[];
  hiddenColumns?: number[];
}

export interface FakeSpreadsheetInit {
  id: string;
  title: string;
  sheets: FakeSheetInit[];
}

interface StoredMeta {
  key: MetadataEntry['key'];
  value: string;
  location: { type: 'SHEET' } | { type: 'ROW' | 'COLUMN'; index: number };
}

interface FakeSheet {
  sheetId: number;
  title: string;
  cells: Map<string, FakeCell>; // key: `${row},${col}`
  merges: { r1: number; c1: number; r2: number; c2: number }[];
  hiddenRows: Set<number>;
  hiddenColumns: Set<number>;
  metadata: StoredMeta[];
}

interface FakeSpreadsheet {
  id: string;
  title: string;
  sheets: FakeSheet[];
  permission: 'edit' | 'view' | 'none';
}

const rc = (row: number, col: number) => `${row},${col}`;
const b64url = (buf: Buffer) => buf.toString('base64url');

export class FakeGoogle implements GoogleOAuthClient, SheetsGateway {
  private readonly spreadsheets = new Map<string, FakeSpreadsheet>();
  private readonly codes = new Map<string, { challenge: string; scope: string }>();
  private readonly accessTokens = new Set<string>();
  private readonly refreshTokens = new Set<string>();
  private failures: { status: number; reason: string; method?: string }[] = [];

  /** 呼叫紀錄（方法名稱），測試用。 */
  readonly calls: string[] = [];
  /** 每次 Sheets 呼叫的模擬延遲（毫秒），SC-003 測試用。 */
  delayMs = 0;
  /** 使用者同意時授予的 scope；設為不含 spreadsheets 以模擬 scope 不足。 */
  grantedScope = FULL_SCOPE;
  email = 'teacher.fake@example.edu';
  /** 授權碼交換失敗（模擬 Google 錯誤）。 */
  failExchange = false;
  revokeFails = false;
  readonly revoked: string[] = [];
  readonly batchRequests: SheetBatchRequest[][] = [];
  /** 發出過的所有授權碼與 token（檢查是否外洩用）。 */
  readonly issuedSecrets: string[] = [];

  // ---------- 測試控制 ----------

  addSpreadsheet(init: FakeSpreadsheetInit): this {
    this.spreadsheets.set(init.id, {
      id: init.id,
      title: init.title,
      permission: 'edit',
      sheets: init.sheets.map((s) => {
        const cells = new Map<string, FakeCell>();
        for (const [ref, v] of Object.entries(s.cells)) {
          const p = parseCellRef(ref);
          if (!p) throw new Error(`bad ref ${ref}`);
          cells.set(rc(p.row, p.col), typeof v === 'string' ? { text: v } : v);
        }
        return {
          sheetId: s.sheetId,
          title: s.title,
          cells,
          merges: (s.merges ?? []).map((m) => {
            const a = parseCellRef(m.start)!;
            const b = parseCellRef(m.end)!;
            return { r1: a.row, c1: a.col, r2: b.row, c2: b.col };
          }),
          hiddenRows: new Set(s.hiddenRows ?? []),
          hiddenColumns: new Set(s.hiddenColumns ?? []),
          metadata: [],
        };
      }),
    });
    return this;
  }

  setPermission(id: string, permission: FakeSpreadsheet['permission']) {
    this.book(id).permission = permission;
  }

  /** 下一次（或指定方法的下一次）呼叫失敗。 */
  failNext(status: number, reason = 'FAKE', method?: string) {
    this.failures.push({ status, reason, method });
  }

  /** 讓 refresh token 失效（模擬老師在 Google 端撤銷）。 */
  invalidateRefreshTokens() {
    this.refreshTokens.clear();
  }

  /** 讓所有 access token 失效（模擬過期，Google 會回 401）。 */
  expireAccessTokens() {
    this.accessTokens.clear();
  }

  /**
   * 模擬老師在 Google 授權頁按下同意／取消，回傳 Google 導回系統時的 query。
   */
  consent(authUrl: string, options: { deny?: boolean } = {}): Record<string, string> {
    const url = new URL(authUrl);
    const state = url.searchParams.get('state') ?? '';
    if (options.deny) return { state, error: 'access_denied' };
    const code = b64url(randomBytes(16));
    this.issuedSecrets.push(code);
    this.codes.set(code, {
      challenge: url.searchParams.get('code_challenge') ?? '',
      scope: this.grantedScope,
    });
    return { state, code, scope: this.grantedScope };
  }

  setCell(id: string, title: string, ref: string, text: string) {
    const p = parseCellRef(ref)!;
    const sheet = this.sheetByTitle(id, title);
    if (text === '') sheet.cells.delete(rc(p.row, p.col));
    else sheet.cells.set(rc(p.row, p.col), { text });
  }

  getCell(id: string, title: string, ref: string): string {
    const p = parseCellRef(ref)!;
    return this.sheetByTitle(id, title).cells.get(rc(p.row, p.col))?.text ?? '';
  }

  addMerge(id: string, title: string, start: string, end: string) {
    const a = parseCellRef(start)!;
    const b = parseCellRef(end)!;
    this.sheetByTitle(id, title).merges.push({ r1: a.row, c1: a.col, r2: b.row, c2: b.col });
  }

  metadataOf(id: string, title: string): StoredMeta[] {
    return this.sheetByTitle(id, title).metadata;
  }

  /** 所有儲存格內容與合併範圍的快照（確認匯入不改內容，SC-006）。 */
  contentSnapshot(id: string, title: string): string {
    const s = this.sheetByTitle(id, title);
    return JSON.stringify({
      cells: [...s.cells.entries()].sort(),
      merges: [...s.merges].sort((x, y) => x.r1 - y.r1 || x.c1 - y.c1),
    });
  }

  /** 在第 beforeRow 列（1 起算）上方插入 count 列。 */
  insertRows(id: string, title: string, beforeRow: number, count = 1) {
    this.shift(this.sheetByTitle(id, title), 'ROW', beforeRow, count);
  }

  deleteRows(id: string, title: string, startRow: number, count = 1) {
    this.remove(this.sheetByTitle(id, title), 'ROW', startRow, count);
  }

  insertColumns(id: string, title: string, beforeCol: number, count = 1) {
    this.shift(this.sheetByTitle(id, title), 'COLUMN', beforeCol, count);
  }

  deleteColumns(id: string, title: string, startCol: number, count = 1) {
    this.remove(this.sheetByTitle(id, title), 'COLUMN', startCol, count);
  }

  // ---------- GoogleOAuthClient ----------

  buildAuthUrl(state: string, codeChallenge: string): string {
    const u = new URL('https://accounts.google.test/o/oauth2/v2/auth');
    u.searchParams.set('state', state);
    u.searchParams.set('code_challenge', codeChallenge);
    u.searchParams.set('code_challenge_method', 'S256');
    return u.toString();
  }

  async exchangeCode(code: string, codeVerifier: string): Promise<TokenSet> {
    this.calls.push('exchangeCode');
    const entry = this.codes.get(code);
    this.codes.delete(code);
    const expected = b64url(createHash('sha256').update(codeVerifier).digest());
    if (this.failExchange || !entry || entry.challenge !== expected) {
      throw new GoogleHttpError(400, 'invalid_grant');
    }
    const accessToken = `fake-access-${b64url(randomBytes(12))}`;
    const refreshToken = `fake-refresh-${b64url(randomBytes(12))}`;
    this.accessTokens.add(accessToken);
    this.refreshTokens.add(refreshToken);
    this.issuedSecrets.push(accessToken, refreshToken);
    return { accessToken, refreshToken, scope: entry.scope, expiresInSeconds: 3600 };
  }

  async refresh(refreshToken: string): Promise<TokenSet> {
    this.calls.push('refresh');
    if (!this.refreshTokens.has(refreshToken)) throw new GoogleHttpError(400, 'invalid_grant');
    const accessToken = `fake-access-${b64url(randomBytes(12))}`;
    this.accessTokens.add(accessToken);
    this.issuedSecrets.push(accessToken);
    return { accessToken, refreshToken: null, scope: FULL_SCOPE, expiresInSeconds: 3600 };
  }

  async revoke(token: string): Promise<void> {
    this.calls.push('revoke');
    if (this.revokeFails) throw new GoogleHttpError(503, 'UNAVAILABLE');
    this.revoked.push(token);
    this.refreshTokens.delete(token);
    this.accessTokens.delete(token);
  }

  async fetchEmail(accessToken: string): Promise<string> {
    this.calls.push('fetchEmail');
    this.checkToken(accessToken);
    return this.email;
  }

  // ---------- SheetsGateway ----------

  async getSpreadsheet(token: string, spreadsheetId: string): Promise<SpreadsheetInfo> {
    const book = await this.enter('getSpreadsheet', token, spreadsheetId);
    return {
      title: book.title,
      sheets: book.sheets.map((s) => ({ sheetId: s.sheetId, title: s.title })),
    };
  }

  async getUsedRange(token: string, spreadsheetId: string, sheetTitle: string): Promise<UsedRange> {
    const book = await this.enter('getUsedRange', token, spreadsheetId);
    const sheet = this.findSheet(book, sheetTitle);
    let rowCount = 0;
    let columnCount = 0;
    for (const key of sheet.cells.keys()) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      rowCount = Math.max(rowCount, r);
      columnCount = Math.max(columnCount, c);
    }
    return rowCount === 0 ? { rowCount: 0, columnCount: 0 } : { rowCount, columnCount };
  }

  async getGrid(
    token: string,
    spreadsheetId: string,
    sheetTitle: string,
    range: UsedRange,
  ): Promise<GridSnapshot> {
    const book = await this.enter('getGrid', token, spreadsheetId);
    const sheet = this.findSheet(book, sheetTitle);
    const cells: GridSnapshot['cells'] = [];
    for (const [key, v] of sheet.cells) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      if (r <= range.rowCount && c <= range.columnCount) {
        cells.push({ ref: toCellRef(r, c), text: v.text, error: v.error ?? false });
      }
    }
    cells.sort((a, b) => {
      const pa = parseCellRef(a.ref)!;
      const pb = parseCellRef(b.ref)!;
      return pa.row - pb.row || pa.col - pb.col;
    });
    return {
      rowCount: range.rowCount,
      columnCount: range.columnCount,
      cells,
      merges: sheet.merges
        .filter((m) => m.r1 <= range.rowCount && m.c1 <= range.columnCount)
        .map((m) => ({ start: toCellRef(m.r1, m.c1), end: toCellRef(m.r2, m.c2) })),
      hiddenRows: [...sheet.hiddenRows].filter((r) => r <= range.rowCount).sort((a, b) => a - b),
      hiddenColumns: [...sheet.hiddenColumns]
        .filter((c) => c <= range.columnCount)
        .sort((a, b) => a - b),
    };
  }

  async searchMetadata(
    token: string,
    spreadsheetId: string,
    sheetId: number,
  ): Promise<MetadataEntry[]> {
    const book = await this.enter('searchMetadata', token, spreadsheetId);
    const sheet = book.sheets.find((s) => s.sheetId === sheetId);
    if (!sheet) return [];
    return sheet.metadata.map((m) => ({
      key: m.key,
      value: m.value,
      location:
        m.location.type === 'SHEET'
          ? { type: 'SHEET', sheetId }
          : { type: m.location.type, sheetId, index: m.location.index },
    }));
  }

  async batchUpdate(
    token: string,
    spreadsheetId: string,
    requests: SheetBatchRequest[],
  ): Promise<void> {
    const book = await this.enter('batchUpdate', token, spreadsheetId);
    if (book.permission !== 'edit') throw new GoogleHttpError(403, 'PERMISSION_DENIED');
    this.batchRequests.push(requests);
    // 整批成功或整批失敗：先在副本上套用
    const copies = new Map(book.sheets.map((s) => [s.sheetId, [...s.metadata]]));
    for (const req of requests) {
      if (req.kind === 'deleteMetadata') {
        const list = copies.get(req.sheetId);
        if (!list) throw new GoogleHttpError(400, 'INVALID_ARGUMENT');
        copies.set(
          req.sheetId,
          list.filter((m) => !req.keys.includes(m.key)),
        );
      } else {
        const { entry } = req;
        const list = copies.get(entry.location.sheetId);
        if (!list) throw new GoogleHttpError(400, 'INVALID_ARGUMENT');
        list.push({
          key: entry.key,
          value: entry.value,
          location:
            entry.location.type === 'SHEET'
              ? { type: 'SHEET' }
              : { type: entry.location.type, index: entry.location.index },
        });
      }
    }
    for (const sheet of book.sheets) sheet.metadata = copies.get(sheet.sheetId)!;
  }

  async updateValues(
    token: string,
    spreadsheetId: string,
    sheetTitle: string,
    updates: CellUpdate[],
  ): Promise<void> {
    const book = await this.enter('updateValues', token, spreadsheetId);
    if (book.permission !== 'edit') throw new GoogleHttpError(403, 'PERMISSION_DENIED');
    const sheet = this.findSheet(book, sheetTitle);
    for (const u of updates) {
      const p = parseCellRef(u.cell)!;
      sheet.cells.set(rc(p.row, p.col), { text: u.value });
    }
  }

  // ---------- 內部 ----------

  private async enter(method: string, token: string, spreadsheetId: string) {
    this.calls.push(method);
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    const idx = this.failures.findIndex((f) => !f.method || f.method === method);
    if (idx !== -1) {
      const [f] = this.failures.splice(idx, 1);
      throw new GoogleHttpError(f!.status, f!.reason);
    }
    this.checkToken(token);
    const book = this.spreadsheets.get(spreadsheetId);
    if (!book) throw new GoogleHttpError(404, 'NOT_FOUND');
    if (book.permission === 'none') throw new GoogleHttpError(403, 'PERMISSION_DENIED');
    return book;
  }

  private checkToken(token: string) {
    if (!this.accessTokens.has(token)) throw new GoogleHttpError(401, 'UNAUTHENTICATED');
  }

  private book(id: string): FakeSpreadsheet {
    const b = this.spreadsheets.get(id);
    if (!b) throw new Error(`no spreadsheet ${id}`);
    return b;
  }

  private findSheet(book: FakeSpreadsheet, title: string): FakeSheet {
    const s = book.sheets.find((x) => x.title === title);
    if (!s) throw new GoogleHttpError(400, 'INVALID_ARGUMENT');
    return s;
  }

  private sheetByTitle(id: string, title: string): FakeSheet {
    return this.findSheet(this.book(id), title);
  }

  /** 插入列／欄：位置 ≥ at 者往後移 count（1 起算）。 */
  private shift(sheet: FakeSheet, dim: 'ROW' | 'COLUMN', at: number, count: number) {
    const move = (n: number) => (n >= at ? n + count : n);
    const cells = new Map<string, FakeCell>();
    for (const [key, v] of sheet.cells) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      cells.set(dim === 'ROW' ? rc(move(r), c) : rc(r, move(c)), v);
    }
    sheet.cells = cells;
    sheet.merges = sheet.merges.map((m) =>
      dim === 'ROW'
        ? { ...m, r1: move(m.r1), r2: m.r2 >= at ? m.r2 + count : m.r2 }
        : { ...m, c1: move(m.c1), c2: m.c2 >= at ? m.c2 + count : m.c2 },
    );
    if (dim === 'ROW') sheet.hiddenRows = new Set([...sheet.hiddenRows].map(move));
    else sheet.hiddenColumns = new Set([...sheet.hiddenColumns].map(move));
    for (const m of sheet.metadata) {
      if (m.location.type === dim && m.location.index + 1 >= at) m.location.index += count;
    }
  }

  /** 刪除列／欄：範圍內的格子、metadata 刪除；之後者往前移。 */
  private remove(sheet: FakeSheet, dim: 'ROW' | 'COLUMN', start: number, count: number) {
    const end = start + count - 1;
    const inRange = (n: number) => n >= start && n <= end;
    const move = (n: number) => (n > end ? n - count : n);
    const cells = new Map<string, FakeCell>();
    for (const [key, v] of sheet.cells) {
      const [r, c] = key.split(',').map(Number) as [number, number];
      const n = dim === 'ROW' ? r : c;
      if (inRange(n)) continue;
      cells.set(dim === 'ROW' ? rc(move(r), c) : rc(r, move(c)), v);
    }
    sheet.cells = cells;
    sheet.merges = sheet.merges
      .filter((m) => {
        const [a, b] = dim === 'ROW' ? [m.r1, m.r2] : [m.c1, m.c2];
        return !(a >= start && b <= end);
      })
      .map((m) =>
        dim === 'ROW'
          ? {
              ...m,
              r1: m.r1 > end ? m.r1 - count : Math.min(m.r1, start),
              r2: m.r2 > end ? m.r2 - count : Math.min(m.r2, start - 1),
            }
          : {
              ...m,
              c1: m.c1 > end ? m.c1 - count : Math.min(m.c1, start),
              c2: m.c2 > end ? m.c2 - count : Math.min(m.c2, start - 1),
            },
      );
    if (dim === 'ROW') {
      sheet.hiddenRows = new Set([...sheet.hiddenRows].filter((n) => !inRange(n)).map(move));
    } else {
      sheet.hiddenColumns = new Set([...sheet.hiddenColumns].filter((n) => !inRange(n)).map(move));
    }
    sheet.metadata = sheet.metadata
      .filter((m) => !(m.location.type === dim && inRange(m.location.index + 1)))
      .map((m) => {
        if (m.location.type === dim && m.location.index + 1 > end) {
          return { ...m, location: { type: dim, index: m.location.index - count } };
        }
        return m;
      });
  }
}
