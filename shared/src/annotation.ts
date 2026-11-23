/**
 * AnnotationRules（組件圖 003-component）：學習單互動標註的共用型別與規則，前後端共用。
 * 型別與限制見 specs/003-sheets-question-import/data-model.md §2。
 */

// ---------- 限制（data-model.md §2、spec FR-011、FR-015、FR-016、FR-019、FR-020） ----------

export const MAX_GRID_ROWS = 500;
export const MAX_GRID_COLUMNS = 52;
export const MAX_QUESTIONS = 200;
export const MAX_PARTS = 10;
export const MAX_QUESTION_TEXT = 2000;
export const MAX_LABEL_LENGTH = 20;
export const MAX_ISSUES = 50;
export const MAX_LINK_LENGTH = 2000;

// ---------- 型別 ----------

export type QuestionKind = 'SINGLE' | 'GROUP';

/** A1 表示法，例如 `G5`；一律為合併範圍的左上角。 */
export type CellRef = string;

export interface SheetLink {
  spreadsheetId: string;
  gid: number | null;
}

export interface GridCell {
  ref: CellRef;
  text: string;
  /** 是否為公式錯誤值（#REF!、#N/A…） */
  error: boolean;
}

export interface MergeRange {
  start: CellRef;
  end: CellRef;
}

export interface GridSnapshot {
  rowCount: number;
  columnCount: number;
  /** 只列非空白格 */
  cells: GridCell[];
  merges: MergeRange[];
  /** 1 起算 */
  hiddenRows: number[];
  /** 1 起算 */
  hiddenColumns: number[];
}

export interface AnnotatedPart {
  questionCell: CellRef | null;
  answerCell: CellRef | null;
}

export interface AnnotatedQuestion {
  key: string;
  label: string;
  labelManual: boolean;
  kind: QuestionKind;
  stemCell: CellRef | null;
  parts: AnnotatedPart[];
}

export interface AnnotationDocument {
  questions: AnnotatedQuestion[];
}

export type IssueCode =
  | 'CELL_OUT_OF_RANGE'
  | 'CELL_ROLE_CONFLICT'
  | 'SAME_CELL_QA'
  | 'QUESTION_TEXT_EMPTY'
  | 'QUESTION_TEXT_TOO_LONG'
  | 'QUESTION_TEXT_ERROR_VALUE'
  | 'LABEL_INVALID'
  | 'LABEL_DUPLICATE'
  | 'TOO_MANY_QUESTIONS'
  | 'TOO_MANY_PARTS'
  | 'SINGLE_SHAPE_INVALID'
  | 'MISSING_QUESTION_CELL'
  | 'MISSING_ANSWER_CELL'
  | 'GROUP_WITHOUT_PARTS'
  | 'NO_QUESTIONS'
  | 'ANSWER_HAS_CONTENT'
  | 'CELL_HIDDEN'
  | 'GROUP_SINGLE_PART'
  | 'RESTORED_CELL_MISSING'
  | 'RESTORED_CONFLICT';

export interface Issue {
  code: IssueCode;
  questionKey?: string;
  partIndex?: number;
  cell?: CellRef;
  message: string;
  hint: string;
}

export interface ValidationResult {
  issues: Issue[];
  warnings: Issue[];
  totalIssues: number;
}

export interface SheetTab {
  sheetId: number;
  title: string;
}

export interface SheetSource {
  spreadsheetId: string;
  spreadsheetTitle: string;
  sheetId: number;
  sheetTitle: string;
  sourceUrl: string;
}

export interface ImportedPartView {
  partLabel: string | null;
  text: string;
  questionCell: string;
  answerCell: string;
  answerHasContent: boolean;
}

export interface ImportedQuestionView {
  label: string;
  kind: QuestionKind;
  stem: { text: string; cell: string } | null;
  parts: ImportedPartView[];
}

export interface QuestionSetView {
  source: SheetSource;
  questionCount: number;
  slotCount: number;
  importedAt?: string;
  questions: ImportedQuestionView[];
  warnings: Issue[];
}

// ---------- A1 工具 ----------

const CELL_REF = /^([A-Z]{1,2})([1-9][0-9]{0,2})$/;

/** 1 → A、27 → AA */
export function colToLetters(col: number): string {
  let n = col;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** A → 1、AZ → 52 */
export function lettersToCol(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function toCellRef(row: number, col: number): CellRef {
  return `${colToLetters(col)}${row}`;
}

export function parseCellRef(ref: string): { row: number; col: number } | null {
  const m = CELL_REF.exec(ref);
  if (!m) return null;
  return { row: Number(m[2]), col: lettersToCol(m[1]!) };
}

export function isValidCellRef(ref: unknown): ref is CellRef {
  return typeof ref === 'string' && CELL_REF.test(ref);
}

/** 找出包含此格的合併範圍。 */
export function mergeOf(ref: CellRef, merges: MergeRange[]): MergeRange | null {
  const p = parseCellRef(ref);
  if (!p) return null;
  for (const m of merges) {
    const s = parseCellRef(m.start);
    const e = parseCellRef(m.end);
    if (!s || !e) continue;
    if (p.row >= s.row && p.row <= e.row && p.col >= s.col && p.col <= e.col) return m;
  }
  return null;
}

/** 合併範圍內任一格正規化為左上角（FR-014）。 */
export function normalizeToMergeTopLeft(ref: CellRef, merges: MergeRange[]): CellRef {
  return mergeOf(ref, merges)?.start ?? ref;
}

export function isInSnapshot(ref: CellRef, snapshot: GridSnapshot): boolean {
  const p = parseCellRef(ref);
  return !!p && p.row <= snapshot.rowCount && p.col <= snapshot.columnCount;
}

/** 取得格子內容（合併格取左上角）。 */
export function cellAt(snapshot: GridSnapshot, ref: CellRef): { text: string; error: boolean } {
  const top = normalizeToMergeTopLeft(ref, snapshot.merges);
  const c = snapshot.cells.find((x) => x.ref === top);
  return { text: c?.text ?? '', error: c?.error ?? false };
}

// ---------- 試算表連結（research R7、FR-008） ----------

export type ParseSheetLinkResult =
  { ok: true; link: SheetLink } | { ok: false; message: string; hint: string };

const LINK_ERROR = {
  ok: false as const,
  message: '請貼上 Google 試算表連結',
  hint: '例如 https://docs.google.com/spreadsheets/d/…',
};

const SHEET_PATH = /^\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]{20,100})(?:\/|$)/;

export function parseSheetLink(input: string): ParseSheetLinkResult {
  if (typeof input !== 'string') return LINK_ERROR;
  const text = input.trim();
  if (text === '' || text.length > MAX_LINK_LENGTH) return LINK_ERROR;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return LINK_ERROR;
  }
  if (url.protocol !== 'https:' || url.hostname !== 'docs.google.com') return LINK_ERROR;
  const m = SHEET_PATH.exec(url.pathname);
  if (!m) return LINK_ERROR;
  const gidRaw = url.searchParams.get('gid') ?? /(?:^#|&)gid=([^&]*)/.exec(url.hash)?.[1] ?? null;
  let gid: number | null = null;
  if (gidRaw !== null) {
    if (!/^\d{1,10}$/.test(gidRaw)) {
      return {
        ok: false,
        message: '連結中的分頁編號（gid）格式不正確',
        hint: '請重新從瀏覽器網址列複製試算表連結',
      };
    }
    gid = Number(gidRaw);
  }
  return { ok: true, link: { spreadsheetId: m[1]!, gid } };
}

// ---------- 標註規則（research R6、data-model.md §2.3） ----------

/** 題目標題：「第 1 題」或題組小題「第 1 題（2）」。 */
export function partLabel(index: number): string {
  return `（${index + 1}）`;
}

function questionTitle(q: AnnotatedQuestion, index: number, partIndex?: number): string {
  const label = q.label.trim() || String(index + 1);
  const base = `第 ${label} 題`;
  return q.kind === 'GROUP' && partIndex !== undefined ? `${base}${partLabel(partIndex)}` : base;
}

const charCount = (text: string) => [...text].length;

/** 未經手動修改的題號依目前順序編為 1、2、3…（FR-017）。 */
export function autoNumber(doc: AnnotationDocument): AnnotationDocument {
  return {
    questions: doc.questions.map((q, i) => (q.labelManual ? q : { ...q, label: String(i + 1) })),
  };
}

/** 所有格子正規化為合併範圍左上角（FR-014）。 */
export function normalizeAnnotations(
  doc: AnnotationDocument,
  snapshot: GridSnapshot,
): AnnotationDocument {
  const n = (ref: CellRef | null) =>
    ref !== null && isValidCellRef(ref) ? normalizeToMergeTopLeft(ref, snapshot.merges) : ref;
  return {
    questions: doc.questions.map((q) => ({
      ...q,
      stemCell: n(q.stemCell),
      parts: q.parts.map((p) => ({ questionCell: n(p.questionCell), answerCell: n(p.answerCell) })),
    })),
  };
}

type Role = 'question' | 'answer' | 'stem';
const ROLE_TEXT: Record<Role, string> = { question: '題目格', answer: '作答格', stem: '共同題幹' };

export interface ValidateOptions {
  /** 預覽／確認時為 true：未完成的題目也視為錯誤（FR-020） */
  complete: boolean;
}

/**
 * 驗證標註文件（research R6）。issues 阻擋預覽與匯入，warnings 只提醒。
 * issues 超過 50 項時只回傳前 50 項，totalIssues 為總數。
 */
export function validateAnnotations(
  doc: AnnotationDocument,
  snapshot: GridSnapshot,
  options: ValidateOptions,
): ValidationResult {
  const issues: Issue[] = [];
  const warnings: Issue[] = [];
  const owners = new Map<CellRef, { title: string; role: Role }>();
  const labels = new Map<string, number>();
  const hiddenRows = new Set(snapshot.hiddenRows);
  const hiddenCols = new Set(snapshot.hiddenColumns);

  if (doc.questions.length > MAX_QUESTIONS) {
    issues.push({
      code: 'TOO_MANY_QUESTIONS',
      message: `題目數為 ${doc.questions.length} 題，超過上限 ${MAX_QUESTIONS} 題`,
      hint: '請刪除多餘的題目',
    });
  }
  if (options.complete && doc.questions.length === 0) {
    issues.push({
      code: 'NO_QUESTIONS',
      message: '尚未標註任何題目',
      hint: '請按「新增題目」開始標註',
    });
  }

  /** 檢查一格：範圍、角色衝突、文字；回傳正規化後的位置（無效時為 null）。 */
  const checkCell = (
    ref: CellRef,
    role: Role,
    q: AnnotatedQuestion,
    qi: number,
    pi: number | undefined,
  ): CellRef | null => {
    const title = questionTitle(q, qi, pi);
    const at = { questionKey: q.key, ...(pi !== undefined ? { partIndex: pi } : {}) };
    if (!isValidCellRef(ref) || !isInSnapshot(ref, snapshot)) {
      issues.push({
        code: 'CELL_OUT_OF_RANGE',
        ...at,
        message: `${title}的${ROLE_TEXT[role]}不在學習單範圍內`,
        hint: '請重新點選格子',
      });
      return null;
    }
    const cell = normalizeToMergeTopLeft(ref, snapshot.merges);
    const owner = owners.get(cell);
    if (owner) {
      issues.push({
        code: 'CELL_ROLE_CONFLICT',
        ...at,
        cell,
        message: `${cell} 已是${owner.title}的${ROLE_TEXT[owner.role]}，請先移除原本的標註`,
        hint: '每個格子只能擔任一個角色',
      });
      return null;
    }
    owners.set(cell, { title, role });
    const p = parseCellRef(cell)!;
    if (hiddenRows.has(p.row) || hiddenCols.has(p.col)) {
      warnings.push({
        code: 'CELL_HIDDEN',
        ...at,
        cell,
        message: `${title}的${ROLE_TEXT[role]} ${cell} 位於隱藏的列或欄`,
        hint: '確認這是要使用的格子',
      });
    }
    const content = cellAt(snapshot, cell);
    if (role === 'answer') {
      if (content.text !== '' || content.error) {
        warnings.push({
          code: 'ANSWER_HAS_CONTENT',
          ...at,
          cell,
          message: `${title}的作答格 ${cell} 已有內容`,
          hint: '系統不會保存這個內容；日後寫回答案時會再確認是否覆寫',
        });
      }
      return cell;
    }
    if (content.error) {
      issues.push({
        code: 'QUESTION_TEXT_ERROR_VALUE',
        ...at,
        cell,
        message: `${cell} 的內容是公式錯誤值（${content.text}）`,
        hint: '請修正試算表中的公式，或點選其他格子',
      });
    } else if (content.text.trim() === '') {
      issues.push({
        code: 'QUESTION_TEXT_EMPTY',
        ...at,
        cell,
        message: `${cell} 沒有文字，${ROLE_TEXT[role]}必須有內容`,
        hint: '請點選有題目文字的格子',
      });
    } else if (charCount(content.text) > MAX_QUESTION_TEXT) {
      issues.push({
        code: 'QUESTION_TEXT_TOO_LONG',
        ...at,
        cell,
        message: `${cell} 的文字有 ${charCount(content.text)} 字，超過上限 ${MAX_QUESTION_TEXT} 字`,
        hint: '請縮短題目文字',
      });
    }
    return cell;
  };

  doc.questions.forEach((q, qi) => {
    const title = questionTitle(q, qi);
    // 題號（FR-017）
    const label = q.label.trim();
    if (label === '' || charCount(label) > MAX_LABEL_LENGTH) {
      issues.push({
        code: 'LABEL_INVALID',
        questionKey: q.key,
        message: `${title}的題號須為 1–${MAX_LABEL_LENGTH} 個字`,
        hint: '請修改題號',
      });
    } else if (labels.has(label)) {
      issues.push({
        code: 'LABEL_DUPLICATE',
        questionKey: q.key,
        message: `題號「${label}」重複`,
        hint: '每一題的題號必須不同',
      });
    } else {
      labels.set(label, qi);
    }
    // 結構（FR-013）
    if (q.kind === 'SINGLE' && (q.parts.length !== 1 || q.stemCell !== null)) {
      issues.push({
        code: 'SINGLE_SHAPE_INVALID',
        questionKey: q.key,
        message: `${title}是單題，只能有一個題目格與一個作答格`,
        hint: '若有多個小題，請改為題組',
      });
    }
    if (q.kind === 'GROUP') {
      if (q.parts.length > MAX_PARTS) {
        issues.push({
          code: 'TOO_MANY_PARTS',
          questionKey: q.key,
          message: `${title}有 ${q.parts.length} 個小題，超過上限 ${MAX_PARTS} 個`,
          hint: '請刪除多餘的小題',
        });
      } else if (q.parts.length === 0 && options.complete) {
        issues.push({
          code: 'GROUP_WITHOUT_PARTS',
          questionKey: q.key,
          message: `${title}是題組，但還沒有任何小題`,
          hint: '請新增小題，或刪除這一題',
        });
      } else if (q.parts.length === 1) {
        warnings.push({
          code: 'GROUP_SINGLE_PART',
          questionKey: q.key,
          message: `${title}是題組但只有一個小題`,
          hint: '可改為單題',
        });
      }
      if (q.stemCell !== null) checkCell(q.stemCell, 'stem', q, qi, undefined);
    }
    // 小題（FR-014～FR-016）
    q.parts.forEach((p, pi) => {
      const partIndex = q.kind === 'GROUP' ? pi : undefined;
      const partTitle = questionTitle(q, qi, partIndex);
      const at = { questionKey: q.key, ...(partIndex !== undefined ? { partIndex } : {}) };
      const qCell =
        p.questionCell !== null && isValidCellRef(p.questionCell)
          ? normalizeToMergeTopLeft(p.questionCell, snapshot.merges)
          : p.questionCell;
      const aCell =
        p.answerCell !== null && isValidCellRef(p.answerCell)
          ? normalizeToMergeTopLeft(p.answerCell, snapshot.merges)
          : p.answerCell;
      if (qCell !== null && aCell !== null && qCell === aCell) {
        issues.push({
          code: 'SAME_CELL_QA',
          ...at,
          cell: qCell,
          message: `${partTitle}的題目格與作答格不能是同一格（${qCell}）`,
          hint: '請重新點選作答格',
        });
        checkCell(p.questionCell!, 'question', q, qi, partIndex);
        return;
      }
      if (p.answerCell === null) {
        if (options.complete) {
          issues.push({
            code: 'MISSING_ANSWER_CELL',
            ...at,
            message: `${partTitle}缺少作答格`,
            hint: '請點選該題的作答格',
          });
        }
      }
      if (p.questionCell === null) {
        if (options.complete) {
          issues.push({
            code: 'MISSING_QUESTION_CELL',
            ...at,
            message: `${partTitle}缺少題目格`,
            hint: '請點選該題的題目格',
          });
        }
      } else {
        checkCell(p.questionCell, 'question', q, qi, partIndex);
      }
      if (p.answerCell !== null) checkCell(p.answerCell, 'answer', q, qi, partIndex);
    });
  });

  return { issues: issues.slice(0, MAX_ISSUES), warnings, totalIssues: issues.length };
}

export const AnnotationRules = { parseSheetLink, validateAnnotations, autoNumber };
