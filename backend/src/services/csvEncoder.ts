/**
 * CsvEncoder（005 組件圖、research R10、contracts/csv-format.md）：純函式、無相依。
 * UTF-8 BOM＋CRLF；每個欄位先防公式注入、再依 RFC 4180 以雙引號跳脫（FR-020、FR-021）。
 */

const BOM = '﻿';
const CRLF = '\r\n';

/**
 * 防公式注入（FR-021、spec Clarifications Q3）：以 `=` 或 `@` 開頭時前置 `'`。
 * 以 `+`、`-`、Tab、CR 開頭者維持原樣（例如「-5 度」），此取捨記錄於 spec Assumptions。
 */
export function neutralizeFormula(value: string): string {
  return value.startsWith('=') || value.startsWith('@') ? `'${value}` : value;
}

/** 含逗號、雙引號、CR 或 LF 時以雙引號包住，內部雙引號改為兩個（FR-020） */
export function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 標題列＋資料列 → CSV 文字（BOM 開頭、每列以 CRLF 結尾） */
export function encode(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (fields: readonly string[]) =>
    fields.map((f) => escapeField(neutralizeFormula(f))).join(',');
  return BOM + [header, ...rows].map((r) => line(r) + CRLF).join('');
}

export const CsvEncoder = { encode, escapeField, neutralizeFormula };
