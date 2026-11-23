/**
 * SheetsGateway（組件圖 003-component、research R2／R3）：以內建 fetch 呼叫 Google Sheets API v4。
 * 只回傳本系統需要的欄位；錯誤以 GoogleHttpError 拋出，由 SheetsService 轉為 AppError。
 */
import { toCellRef, type GridSnapshot, type SheetTab } from '@buzzer/shared';
import type {
  CellUpdate,
  MetadataEntry,
  SheetBatchRequest,
  SheetsGateway as SheetsGatewayPort,
  SpreadsheetInfo,
  UsedRange,
} from '../../domain/questionPorts.js';
import { googleFetch, type GoogleHttpOptions } from './googleHttp.js';

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
export const METADATA_KEYS: MetadataEntry['key'][] = ['qimport.set', 'qimport.row', 'qimport.col'];

/** 分頁名稱的 A1 表示法：'名稱'（單引號以 '' 跳脫）。 */
export const quoteSheet = (title: string) => `'${title.replace(/'/g, "''")}'`;

const GRID_FIELDS =
  'sheets(merges,data(rowMetadata(hiddenByUser,hiddenByFilter),columnMetadata(hiddenByUser),' +
  'rowData(values(formattedValue,effectiveValue(errorValue)))))';

interface GridRange {
  startRowIndex?: number;
  endRowIndex?: number;
  startColumnIndex?: number;
  endColumnIndex?: number;
}

interface ApiMetadata {
  metadataKey?: string;
  metadataValue?: string;
  location?: {
    locationType?: string;
    sheetId?: number;
    dimensionRange?: { sheetId?: number; startIndex?: number };
  };
}

function toEntry(m: ApiMetadata): MetadataEntry | null {
  const key = m.metadataKey as MetadataEntry['key'];
  if (!METADATA_KEYS.includes(key) || typeof m.metadataValue !== 'string') return null;
  const loc = m.location;
  if (loc?.locationType === 'SHEET' && typeof loc.sheetId === 'number') {
    return { key, value: m.metadataValue, location: { type: 'SHEET', sheetId: loc.sheetId } };
  }
  const dr = loc?.dimensionRange;
  if ((loc?.locationType === 'ROW' || loc?.locationType === 'COLUMN') && dr) {
    return {
      key,
      value: m.metadataValue,
      location: { type: loc.locationType, sheetId: dr.sheetId ?? 0, index: dr.startIndex ?? 0 },
    };
  }
  return null;
}

function toApiLocation(location: MetadataEntry['location']) {
  if (location.type === 'SHEET') return { sheetId: location.sheetId };
  return {
    dimensionRange: {
      sheetId: location.sheetId,
      dimension: location.type === 'ROW' ? 'ROWS' : 'COLUMNS',
      startIndex: location.index,
      endIndex: location.index + 1,
    },
  };
}

export class SheetsGateway implements SheetsGatewayPort {
  constructor(private readonly http: GoogleHttpOptions = {}) {}

  private auth(token: string, init: RequestInit = {}): RequestInit {
    return {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    };
  }

  async getSpreadsheet(token: string, spreadsheetId: string): Promise<SpreadsheetInfo> {
    const url = new URL(`${BASE}/${encodeURIComponent(spreadsheetId)}`);
    url.searchParams.set('fields', 'properties.title,sheets.properties(sheetId,title,index)');
    const body = (await googleFetch(url.toString(), this.auth(token), this.http)) as {
      properties?: { title?: string };
      sheets?: { properties?: { sheetId?: number; title?: string; index?: number } }[];
    } | null;
    const sheets = (body?.sheets ?? [])
      .map((s) => s.properties ?? {})
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((p): SheetTab => ({ sheetId: p.sheetId ?? 0, title: p.title ?? '' }));
    return { title: body?.properties?.title ?? '', sheets };
  }

  async getUsedRange(token: string, spreadsheetId: string, sheetTitle: string): Promise<UsedRange> {
    const url = new URL(
      `${BASE}/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(quoteSheet(sheetTitle))}`,
    );
    url.searchParams.set('majorDimension', 'ROWS');
    url.searchParams.set('valueRenderOption', 'FORMATTED_VALUE');
    url.searchParams.set('fields', 'values');
    const body = (await googleFetch(url.toString(), this.auth(token), this.http)) as {
      values?: unknown[][];
    } | null;
    const values = body?.values ?? [];
    // Google 已去除尾端空白列與空白欄，但列內仍可能有空字串
    let rowCount = 0;
    let columnCount = 0;
    values.forEach((row, r) => {
      (row ?? []).forEach((v, c) => {
        if (v !== '' && v !== null && v !== undefined) {
          rowCount = Math.max(rowCount, r + 1);
          columnCount = Math.max(columnCount, c + 1);
        }
      });
    });
    return { rowCount, columnCount };
  }

  async getGrid(
    token: string,
    spreadsheetId: string,
    sheetTitle: string,
    range: UsedRange,
  ): Promise<GridSnapshot> {
    const url = new URL(`${BASE}/${encodeURIComponent(spreadsheetId)}`);
    url.searchParams.set(
      'ranges',
      `${quoteSheet(sheetTitle)}!A1:${toCellRef(range.rowCount, range.columnCount)}`,
    );
    url.searchParams.set('includeGridData', 'true');
    url.searchParams.set('fields', GRID_FIELDS);
    const body = (await googleFetch(url.toString(), this.auth(token), this.http)) as {
      sheets?: {
        merges?: GridRange[];
        data?: {
          rowMetadata?: { hiddenByUser?: boolean; hiddenByFilter?: boolean }[];
          columnMetadata?: { hiddenByUser?: boolean }[];
          rowData?: {
            values?: { formattedValue?: string; effectiveValue?: { errorValue?: unknown } }[];
          }[];
        }[];
      }[];
    } | null;
    const sheet = body?.sheets?.[0] ?? {};
    const data = sheet.data?.[0] ?? {};
    const cells: GridSnapshot['cells'] = [];
    (data.rowData ?? []).forEach((row, r) => {
      (row.values ?? []).forEach((v, c) => {
        const text = v.formattedValue ?? '';
        const error = v.effectiveValue?.errorValue !== undefined;
        if (text !== '' || error) cells.push({ ref: toCellRef(r + 1, c + 1), text, error });
      });
    });
    const merges = (sheet.merges ?? [])
      .filter(
        (m) =>
          (m.startRowIndex ?? 0) < range.rowCount && (m.startColumnIndex ?? 0) < range.columnCount,
      )
      .map((m) => ({
        start: toCellRef((m.startRowIndex ?? 0) + 1, (m.startColumnIndex ?? 0) + 1),
        end: toCellRef(m.endRowIndex ?? 1, m.endColumnIndex ?? 1),
      }));
    const hiddenRows: number[] = [];
    (data.rowMetadata ?? []).forEach((m, i) => {
      if (m.hiddenByUser || m.hiddenByFilter) hiddenRows.push(i + 1);
    });
    const hiddenColumns: number[] = [];
    (data.columnMetadata ?? []).forEach((m, i) => {
      if (m.hiddenByUser) hiddenColumns.push(i + 1);
    });
    return {
      rowCount: range.rowCount,
      columnCount: range.columnCount,
      cells,
      merges,
      hiddenRows,
      hiddenColumns,
    };
  }

  async searchMetadata(
    token: string,
    spreadsheetId: string,
    sheetId: number,
  ): Promise<MetadataEntry[]> {
    const url = `${BASE}/${encodeURIComponent(spreadsheetId)}/developerMetadata:search`;
    const body = (await googleFetch(
      url,
      this.auth(token, {
        method: 'POST',
        body: JSON.stringify({
          dataFilters: METADATA_KEYS.map((metadataKey) => ({
            developerMetadataLookup: {
              metadataKey,
              metadataLocation: { sheetId },
              locationMatchingStrategy: 'INTERSECTING_LOCATION',
            },
          })),
        }),
      }),
      this.http,
    )) as { matchedDeveloperMetadata?: { developerMetadata?: ApiMetadata }[] } | null;
    return (body?.matchedDeveloperMetadata ?? [])
      .map((m) => (m.developerMetadata ? toEntry(m.developerMetadata) : null))
      .filter((e): e is MetadataEntry => e !== null);
  }

  async batchUpdate(
    token: string,
    spreadsheetId: string,
    requests: SheetBatchRequest[],
  ): Promise<void> {
    const apiRequests = requests.flatMap((req): object[] => {
      if (req.kind === 'deleteMetadata') {
        return req.keys.map((metadataKey) => ({
          deleteDeveloperMetadata: {
            dataFilter: {
              developerMetadataLookup: {
                metadataKey,
                metadataLocation: { sheetId: req.sheetId },
                locationMatchingStrategy: 'INTERSECTING_LOCATION',
              },
            },
          },
        }));
      }
      return [
        {
          createDeveloperMetadata: {
            developerMetadata: {
              metadataKey: req.entry.key,
              metadataValue: req.entry.value,
              visibility: 'PROJECT',
              location: toApiLocation(req.entry.location),
            },
          },
        },
      ];
    });
    await googleFetch(
      `${BASE}/${encodeURIComponent(spreadsheetId)}:batchUpdate`,
      this.auth(token, { method: 'POST', body: JSON.stringify({ requests: apiRequests }) }),
      this.http,
    );
  }

  async updateValues(
    token: string,
    spreadsheetId: string,
    sheetTitle: string,
    updates: CellUpdate[],
  ): Promise<void> {
    await googleFetch(
      `${BASE}/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`,
      this.auth(token, {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: updates.map((u) => ({
            range: `${quoteSheet(sheetTitle)}!${u.cell}`,
            values: [[u.value]],
          })),
        }),
      }),
      this.http,
    );
  }
}
