import { useMemo, useState, type CSSProperties } from 'react';
import {
  colToLetters,
  parseCellRef,
  toCellRef,
  type CellRef,
  type GridSnapshot,
} from '@buzzer/shared';
import { Button } from '../components/Button';

/** 縮放段數（FR-034）：100% 以上每格高度 ≥ 44px。 */
export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2] as const;
const BASE_CELL_H = 44;
const BASE_CELL_W = 96;

export type MarkTone = 'question' | 'answer' | 'stem';

export interface CellMark {
  /** 角標文字，例如「題1」「答1-2」「幹3」 */
  label: string;
  tone: MarkTone;
  /** 006：屬於目前這一題時為 true，以較粗外框醒目顯示（FR-021） */
  current?: boolean;
}

export interface SheetGridProps {
  grid: GridSnapshot;
  onCellClick: (ref: CellRef) => void;
  /** 已標註格子的角標 */
  marks?: Record<CellRef, CellMark>;
  /** 目前選取的格子 */
  selected?: CellRef | null;
}

const TONE_CLASS: Record<MarkTone, string> = {
  question: 'bg-primary/15 ring-2 ring-primary',
  answer: 'bg-accent/25 ring-2 ring-accent',
  stem: 'bg-cream-300 ring-2 ring-ink/40',
};

const BADGE_CLASS: Record<MarkTone, string> = {
  question: 'bg-primary text-white',
  answer: 'bg-accent text-ink',
  stem: 'bg-ink text-white',
};

/**
 * SheetGrid（組件圖 003-component、research R8）：以 CSS Grid 呈現學習單格子；
 * 合併格以 span 呈現、隱藏列欄淡色；點選任一格回傳其（合併範圍左上角）位置。
 */
export function SheetGrid({ grid, onCellClick, marks = {}, selected = null }: SheetGridProps) {
  const [zoomIndex, setZoomIndex] = useState(2);
  const zoom = ZOOM_LEVELS[zoomIndex]!;

  const layout = useMemo(() => {
    const text = new Map(grid.cells.map((c) => [c.ref, c]));
    const span = new Map<string, { rows: number; cols: number }>();
    const covered = new Set<string>();
    for (const m of grid.merges) {
      const s = parseCellRef(m.start);
      const e = parseCellRef(m.end);
      if (!s || !e) continue;
      const endRow = Math.min(e.row, grid.rowCount);
      const endCol = Math.min(e.col, grid.columnCount);
      span.set(m.start, { rows: endRow - s.row + 1, cols: endCol - s.col + 1 });
      for (let r = s.row; r <= endRow; r++) {
        for (let c = s.col; c <= endCol; c++) {
          if (r !== s.row || c !== s.col) covered.add(toCellRef(r, c));
        }
      }
    }
    return { text, span, covered };
  }, [grid]);

  const hiddenRows = useMemo(() => new Set(grid.hiddenRows), [grid.hiddenRows]);
  const hiddenCols = useMemo(() => new Set(grid.hiddenColumns), [grid.hiddenColumns]);

  const style = {
    '--cell-h': `${BASE_CELL_H * zoom}px`,
    '--cell-w': `${BASE_CELL_W * zoom}px`,
    gridTemplateColumns: `2.75rem repeat(${grid.columnCount}, var(--cell-w))`,
    gridAutoRows: 'var(--cell-h)',
    fontSize: `${Math.max(0.625, 0.875 * zoom)}rem`,
  } as CSSProperties;

  const cells = [];
  for (let r = 1; r <= grid.rowCount; r++) {
    cells.push(
      <div
        key={`rh-${r}`}
        role="rowheader"
        className="sticky left-0 z-10 flex items-center justify-center border-b border-r border-cream-300 bg-cream-100 text-xs"
        style={{ gridRow: r + 1, gridColumn: 1 }}
      >
        {r}
      </div>,
    );
    for (let c = 1; c <= grid.columnCount; c++) {
      const ref = toCellRef(r, c);
      if (layout.covered.has(ref)) continue;
      const info = layout.text.get(ref);
      const sp = layout.span.get(ref);
      const hidden = hiddenRows.has(r) || hiddenCols.has(c);
      const mark = marks[ref];
      const isSelected = selected === ref;
      cells.push(
        <button
          key={ref}
          type="button"
          role="gridcell"
          aria-label={info?.text ? `${ref}：${info.text}` : ref}
          aria-selected={isSelected}
          data-hidden={hidden ? 'true' : 'false'}
          data-error={info?.error ? 'true' : 'false'}
          data-current={mark?.current ? 'true' : undefined}
          onClick={() => onCellClick(ref)}
          title={info?.text || ref}
          className={`relative overflow-hidden border-b border-r border-cream-300 px-1 text-left leading-tight focus-visible:outline-2 focus-visible:outline-primary ${
            hidden ? 'opacity-40' : ''
          } ${info?.error ? 'text-danger' : ''} ${mark ? TONE_CLASS[mark.tone] : 'bg-cream-50 hover:bg-cream-100'} ${mark?.current ? 'z-[5] ring-4' : ''} ${
            isSelected ? 'outline-3 outline-primary' : ''
          }`}
          style={{
            gridRow: sp ? `${r + 1} / span ${sp.rows}` : `${r + 1}`,
            gridColumn: sp ? `${c + 1} / span ${sp.cols}` : `${c + 1}`,
          }}
        >
          {mark ? (
            <span
              className={`absolute right-0.5 top-0.5 rounded px-1 text-[0.65rem] font-bold ${BADGE_CLASS[mark.tone]} ${
                mark.current ? 'ring-2 ring-ink ring-offset-1' : ''
              }`}
            >
              {mark.label}
            </span>
          ) : null}
          <span className="line-clamp-2 break-all">{info?.text ?? ''}</span>
        </button>,
      );
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          aria-label="縮小"
          disabled={zoomIndex === 0}
          onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}
        >
          −
        </Button>
        <span aria-live="polite" className="min-w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          variant="ghost"
          aria-label="放大"
          disabled={zoomIndex === ZOOM_LEVELS.length - 1}
          onClick={() => setZoomIndex((i) => Math.min(ZOOM_LEVELS.length - 1, i + 1))}
        >
          ＋
        </Button>
      </div>
      <div
        data-testid="sheet-grid-scroll"
        className="max-h-[70vh] w-full max-w-full overflow-auto rounded-md border border-cream-300 bg-cream-50"
      >
        <div role="grid" aria-label="學習單格子" className="grid w-max" style={style}>
          <div
            className="sticky left-0 top-0 z-20 border-b border-r border-cream-300 bg-cream-100"
            style={{ gridRow: 1, gridColumn: 1 }}
          />
          {Array.from({ length: grid.columnCount }, (_, i) => (
            <div
              key={`ch-${i}`}
              role="columnheader"
              className="sticky top-0 z-10 flex items-center justify-center border-b border-r border-cream-300 bg-cream-100 text-xs"
              style={{ gridRow: 1, gridColumn: i + 2 }}
            >
              {colToLetters(i + 1)}
            </div>
          ))}
          {cells}
        </div>
      </div>
    </div>
  );
}
