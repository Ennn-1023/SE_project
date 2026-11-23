/**
 * SheetsService（組件圖 003-component：F3 串接層）：對外提供讀取學習單、取代標註、
 * 依標註定位作答格（F10）與寫入儲存格（F10）。負責取得 token、401 時更新後重試一次，
 * 並把 Google 錯誤轉為清楚的 AppError（research R2）。
 */
import { MAX_GRID_COLUMNS, MAX_GRID_ROWS, parseCellRef, type GridSnapshot } from '@buzzer/shared';
import type {
  CellUpdate,
  MetadataEntry,
  SheetData,
  SheetsGateway,
  SlotLocation,
  UsedRange,
} from '../domain/questionPorts.js';
import { GoogleHttpError, mapGoogleError } from '../integrations/google/googleHttp.js';
import { METADATA_KEYS } from '../integrations/google/sheetsGateway.js';
import { AppError, appError } from '../lib/errors.js';
import type { Logger } from '../lib/logger.js';
import type { GoogleAuthService } from './googleAuthService.js';

/** 使用範圍外再多顯示的空白列欄，讓老師能點選範圍外的空白作答格。 */
export const GRID_PADDING = 2;

/** 依標註取得目前作答格位置（由 AnnotationCodec 實作，避免循環相依）。 */
export type LocateSlots = (entries: MetadataEntry[], grid: GridSnapshot) => SlotLocation[];

export class SheetsService {
  constructor(
    private readonly auth: GoogleAuthService,
    private readonly gateway: SheetsGateway,
    private readonly logger: Logger,
    private readonly locate: LocateSlots = () => [],
  ) {}

  /** 取得 token 執行 fn；Google 回 401 時強制更新 token 後重試一次。 */
  private async withToken<T>(
    userId: number,
    phase: 'read' | 'write',
    fn: (token: string) => Promise<T>,
  ): Promise<T> {
    let token = await this.auth.getAccessToken(userId);
    try {
      return await fn(token);
    } catch (err) {
      if (err instanceof GoogleHttpError && err.status === 401) {
        token = await this.auth.getAccessToken(userId, true);
        try {
          return await fn(token);
        } catch (retryErr) {
          throw mapGoogleError(retryErr, phase, this.logger);
        }
      }
      throw mapGoogleError(err, phase, this.logger);
    }
  }

  /** 讀取分頁清單、使用範圍、格子與本系統的標註（FR-005、FR-011）。 */
  async readSheet(
    userId: number,
    spreadsheetId: string,
    sheetId: number | null,
  ): Promise<SheetData> {
    return this.withToken(userId, 'read', async (token) => {
      const info = await this.gateway.getSpreadsheet(token, spreadsheetId);
      const sheet =
        sheetId === null ? info.sheets[0] : info.sheets.find((s) => s.sheetId === sheetId);
      if (!sheet) throw appError('SHEET_TAB_NOT_FOUND', { details: { sheets: info.sheets } });
      const used = await this.gateway.getUsedRange(token, spreadsheetId, sheet.title);
      if (used.rowCount === 0 || used.columnCount === 0) throw appError('SHEET_EMPTY');
      if (used.rowCount > MAX_GRID_ROWS || used.columnCount > MAX_GRID_COLUMNS) {
        throw appError('SHEET_TOO_LARGE', {
          message: `這個分頁的使用範圍為 ${used.rowCount} 列 × ${used.columnCount} 欄，超過上限 ${MAX_GRID_ROWS} 列 × ${MAX_GRID_COLUMNS} 欄`,
          details: { rowCount: used.rowCount, columnCount: used.columnCount },
        });
      }
      const range: UsedRange = {
        rowCount: Math.min(MAX_GRID_ROWS, used.rowCount + GRID_PADDING),
        columnCount: Math.min(MAX_GRID_COLUMNS, used.columnCount + GRID_PADDING),
      };
      const grid = await this.gateway.getGrid(token, spreadsheetId, sheet.title, range);
      // 合併範圍超出顯示範圍時擴大（不超過上限），讓整個合併格都能呈現
      for (const m of grid.merges) {
        const end = parseCellRef(m.end);
        if (!end) continue;
        grid.rowCount = Math.min(MAX_GRID_ROWS, Math.max(grid.rowCount, end.row));
        grid.columnCount = Math.min(MAX_GRID_COLUMNS, Math.max(grid.columnCount, end.col));
      }
      const metadata = await this.gateway.searchMetadata(token, spreadsheetId, sheet.sheetId);
      return {
        spreadsheetId,
        spreadsheetTitle: info.title,
        sheets: info.sheets,
        sheet,
        grid,
        metadata,
      };
    });
  }

  /** 以單一 batchUpdate 取代本系統在此分頁的所有標註（FR-023；整批成功或失敗）。 */
  async replaceAnnotations(
    userId: number,
    spreadsheetId: string,
    sheetId: number,
    entries: MetadataEntry[],
  ): Promise<void> {
    await this.withToken(userId, 'write', (token) =>
      this.gateway.batchUpdate(token, spreadsheetId, [
        { kind: 'deleteMetadata', sheetId, keys: METADATA_KEYS },
        ...entries.map((entry) => ({ kind: 'createMetadata' as const, entry })),
      ]),
    );
  }

  /** F10 用：依試算表上的標註取得每個作答格「目前」的位置（FR-007a）。 */
  async locateAnswerCells(
    userId: number,
    spreadsheetId: string,
    sheetId: number,
  ): Promise<SlotLocation[]> {
    const data = await this.readSheet(userId, spreadsheetId, sheetId);
    return this.locate(data.metadata, data.grid);
  }

  /** F10 用：只寫入指定格子（FR-007b）。 */
  async writeCells(
    userId: number,
    spreadsheetId: string,
    sheetId: number,
    updates: CellUpdate[],
  ): Promise<void> {
    if (updates.length === 0) return;
    for (const u of updates) {
      if (!parseCellRef(u.cell))
        throw new AppError('VALIDATION_ERROR', `儲存格位置 ${u.cell} 格式不正確`);
    }
    const data = await this.withToken(userId, 'read', (token) =>
      this.gateway.getSpreadsheet(token, spreadsheetId),
    );
    const sheet = data.sheets.find((s) => s.sheetId === sheetId);
    if (!sheet) throw appError('SHEET_TAB_NOT_FOUND', { details: { sheets: data.sheets } });
    await this.withToken(userId, 'write', (token) =>
      this.gateway.updateValues(token, spreadsheetId, sheet.title, updates),
    );
  }
}
