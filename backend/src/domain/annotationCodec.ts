/**
 * AnnotationCodec（組件圖 003-component、research R3、data-model.md §3）：
 * 老師的標註 ⇄ 試算表上的 developer metadata。developer metadata 只能附在整列／整欄／分頁，
 * 因此以「列錨點（qimport.row）× 欄錨點（qimport.col）」表示格子，題目順序與題號存在分頁層級（qimport.set）。
 * 列欄被插入或刪除時 metadata 會跟著移動或被刪除，decode 依其目前位置還原格子。
 */
import { createHash, randomBytes } from 'node:crypto';
import {
  parseCellRef,
  partLabel,
  toCellRef,
  type AnnotatedQuestion,
  type AnnotationDocument,
  type CellRef,
  type GridSnapshot,
  type Issue,
} from '@buzzer/shared';
import type { MetadataEntry } from './questionPorts.js';

type RoleCode = 'Q' | 'A' | 'S';

interface SetValue {
  v: 1;
  qs: {
    /** 題目 key */
    q: string;
    /** 題號 */
    n: string;
    /** 是否手動修改題號 */
    m: 0 | 1;
    /** 類型：S 單題、G 題組 */
    k: 'S' | 'G';
    /** 小題數（用來偵測整列被刪除的小題） */
    np: number;
    /** 是否有共同題幹 */
    s: 0 | 1;
  }[];
}

interface RowItem {
  /** 欄錨點 */
  c: string;
  q: string;
  /** 小題序；共同題幹為 -1 */
  p: number;
  r: RoleCode;
}

export interface DecodeResult {
  doc: AnnotationDocument;
  warnings: Issue[];
}

const ANCHOR_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

function newAnchor(used: Set<string>): string {
  for (;;) {
    const a = Array.from(randomBytes(6), (b) => ANCHOR_CHARS[b % ANCHOR_CHARS.length]).join('');
    if (!used.has(a)) {
      used.add(a);
      return a;
    }
  }
}

const slotId = (q: string, p: number, r: RoleCode) => `${q}|${p}|${r}`;

export class AnnotationCodec {
  /** 把完整的標註文件編成要寫入試算表的 metadata（每次重新產生欄錨點）。 */
  encode(doc: AnnotationDocument, _snapshot: GridSnapshot, sheetId: number): MetadataEntry[] {
    const usedAnchors = new Set<string>();
    const colAnchor = new Map<number, string>();
    const rows = new Map<number, RowItem[]>();
    const place = (cell: CellRef | null, q: string, p: number, r: RoleCode) => {
      const pos = cell ? parseCellRef(cell) : null;
      if (!pos) return;
      let anchor = colAnchor.get(pos.col);
      if (!anchor) {
        anchor = newAnchor(usedAnchors);
        colAnchor.set(pos.col, anchor);
      }
      const list = rows.get(pos.row) ?? [];
      list.push({ c: anchor, q, p, r });
      rows.set(pos.row, list);
    };
    const set: SetValue = { v: 1, qs: [] };
    for (const question of doc.questions) {
      set.qs.push({
        q: question.key,
        n: question.label,
        m: question.labelManual ? 1 : 0,
        k: question.kind === 'GROUP' ? 'G' : 'S',
        np: question.parts.length,
        s: question.stemCell ? 1 : 0,
      });
      place(question.stemCell, question.key, -1, 'S');
      question.parts.forEach((part, p) => {
        place(part.questionCell, question.key, p, 'Q');
        place(part.answerCell, question.key, p, 'A');
      });
    }
    const entries: MetadataEntry[] = [
      { key: 'qimport.set', value: JSON.stringify(set), location: { type: 'SHEET', sheetId } },
    ];
    for (const [row, items] of rows) {
      entries.push({
        key: 'qimport.row',
        value: JSON.stringify(items),
        location: { type: 'ROW', sheetId, index: row - 1 },
      });
    }
    for (const [col, anchor] of colAnchor) {
      entries.push({
        key: 'qimport.col',
        value: JSON.stringify({ c: anchor }),
        location: { type: 'COLUMN', sheetId, index: col - 1 },
      });
    }
    return entries;
  }

  /**
   * 依 metadata 目前所在的列欄還原標註（FR-024）。找不到的格子（欄或列被刪除）、
   * 兩個標註落在同一格時，相關格子設為 null 並回傳提醒，該題即為未完成。
   */
  decode(entries: MetadataEntry[], snapshot: GridSnapshot): DecodeResult {
    const setEntry = entries.find((e) => e.key === 'qimport.set');
    if (!setEntry) return { doc: { questions: [] }, warnings: [] };
    let set: SetValue;
    try {
      set = JSON.parse(setEntry.value) as SetValue;
      if (!Array.isArray(set.qs)) throw new Error('bad');
    } catch {
      return { doc: { questions: [] }, warnings: [] };
    }

    const anchors = new Map<string, number>();
    for (const e of entries) {
      if (e.key !== 'qimport.col' || e.location.type !== 'COLUMN') continue;
      try {
        const v = JSON.parse(e.value) as { c?: unknown };
        if (typeof v.c === 'string') anchors.set(v.c, e.location.index + 1);
      } catch {
        /* 略過格式錯誤的 metadata */
      }
    }

    const found = new Map<string, CellRef>();
    const cellOwners = new Map<CellRef, string[]>();
    for (const e of entries) {
      if (e.key !== 'qimport.row' || e.location.type !== 'ROW') continue;
      let items: RowItem[];
      try {
        items = JSON.parse(e.value) as RowItem[];
        if (!Array.isArray(items)) continue;
      } catch {
        continue;
      }
      for (const it of items) {
        const col = anchors.get(it.c);
        if (col === undefined) continue; // 欄被刪除
        const cell = toCellRef(e.location.index + 1, col);
        const id = slotId(it.q, it.p, it.r);
        found.set(id, cell);
        cellOwners.set(cell, [...(cellOwners.get(cell) ?? []), id]);
      }
    }

    const warnings: Issue[] = [];
    const conflicted = new Set<string>();
    for (const [cell, ids] of cellOwners) {
      if (ids.length > 1) for (const id of ids) conflicted.add(id);
      if (ids.length > 1) {
        warnings.push({
          code: 'RESTORED_CONFLICT',
          cell,
          message: `帶回的標註中有 ${ids.length} 個角色落在同一格 ${cell}`,
          hint: '請重新指定這些格子',
        });
      }
    }

    const questions: AnnotatedQuestion[] = set.qs.map((entry, qi) => {
      const kind = entry.k === 'G' ? 'GROUP' : 'SINGLE';
      const title = `第 ${entry.n || qi + 1} 題`;
      const take = (p: number, r: RoleCode, what: string): CellRef | null => {
        const id = slotId(entry.q, p, r);
        const cell = found.get(id);
        if (cell && !conflicted.has(id)) return cell;
        if (!cell) {
          warnings.push({
            code: 'RESTORED_CELL_MISSING',
            questionKey: entry.q,
            ...(p >= 0 && kind === 'GROUP' ? { partIndex: p } : {}),
            message: `${title}${p >= 0 && kind === 'GROUP' ? partLabel(p) : ''}的${what}已不存在，請重新指定`,
            hint: '學習單的列或欄可能已被刪除',
          });
        }
        return null;
      };
      return {
        key: entry.q,
        label: entry.n,
        labelManual: entry.m === 1,
        kind,
        stemCell: entry.s === 1 ? take(-1, 'S', '共同題幹') : null,
        parts: Array.from({ length: Math.max(0, entry.np) }, (_, p) => ({
          questionCell: take(p, 'Q', '題目格'),
          answerCell: take(p, 'A', '作答格'),
        })),
      };
    });

    // 只保留仍在快照範圍內的格子
    const inRange = (cell: CellRef | null) => {
      const pos = cell ? parseCellRef(cell) : null;
      return pos && pos.row <= snapshot.rowCount && pos.col <= snapshot.columnCount ? cell : null;
    };
    for (const question of questions) {
      question.stemCell = inRange(question.stemCell);
      question.parts = question.parts.map((p) => ({
        questionCell: inRange(p.questionCell),
        answerCell: inRange(p.answerCell),
      }));
    }
    return { doc: { questions }, warnings };
  }

  /** 本系統 metadata 的穩定雜湊（與順序無關），用來偵測確認前是否被其他人改過（research R4）。 */
  fingerprint(entries: MetadataEntry[]): string {
    const normalized = entries
      .map((e) =>
        JSON.stringify([
          e.key,
          e.value,
          e.location.type,
          e.location.type === 'SHEET' ? -1 : e.location.index,
        ]),
      )
      .sort();
    return createHash('sha256').update(normalized.join('\n')).digest('hex');
  }
}
