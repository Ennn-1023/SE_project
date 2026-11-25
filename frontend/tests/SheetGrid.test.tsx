import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { GridSnapshot } from '@buzzer/shared';
import { SheetGrid } from '../src/questions/SheetGrid';

const grid: GridSnapshot = {
  rowCount: 6,
  columnCount: 8,
  cells: [
    { ref: 'B4', text: '題號', error: false },
    { ref: 'C5', text: '虛構題目一？', error: false },
    { ref: 'G5', text: '舊答案', error: false },
    { ref: 'C6', text: '#REF!', error: true },
  ],
  merges: [
    { start: 'C5', end: 'F5' },
    { start: 'G5', end: 'H5' },
  ],
  hiddenRows: [3],
  hiddenColumns: [2],
};

describe('SheetGrid（US1、research R8）', () => {
  it('顯示欄列標示與文字，合併格只呈現一格並跨欄', () => {
    render(<SheetGrid grid={grid} onCellClick={vi.fn()} />);
    const table = screen.getByRole('grid', { name: '學習單格子' });
    expect(within(table).getByText('A')).toBeInTheDocument();
    expect(within(table).getByText('H')).toBeInTheDocument();
    expect(within(table).getByText('6')).toBeInTheDocument();
    const c5 = screen.getByRole('gridcell', { name: /^C5/ });
    expect(c5).toHaveTextContent('虛構題目一？');
    expect(c5.style.gridColumn).toBe('4 / span 4');
    // 合併範圍內的 D5～F5 不另外呈現
    expect(screen.queryByRole('gridcell', { name: /^D5/ })).toBeNull();
    expect(screen.getByRole('gridcell', { name: /^C6/ })).toHaveAttribute('data-error', 'true');
  });

  it('隱藏的列與欄以淡色標示', () => {
    render(<SheetGrid grid={grid} onCellClick={vi.fn()} />);
    expect(screen.getByRole('gridcell', { name: /^A3/ })).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByRole('gridcell', { name: /^B4/ })).toHaveAttribute('data-hidden', 'true');
    expect(screen.getByRole('gridcell', { name: /^A1/ })).toHaveAttribute('data-hidden', 'false');
  });

  it('點選合併格回傳左上角位置；空白格也可點選（正常）', async () => {
    const onCellClick = vi.fn();
    render(<SheetGrid grid={grid} onCellClick={onCellClick} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('gridcell', { name: /^C5/ }));
    await user.click(screen.getByRole('gridcell', { name: /^H6/ }));
    expect(onCellClick.mock.calls).toEqual([['C5'], ['H6']]);
  });

  it('縮放 50%～200% 五段，≥ 100% 時格子高度 ≥ 44px（FR-034、邊界）', async () => {
    render(<SheetGrid grid={grid} onCellClick={vi.fn()} />);
    const user = userEvent.setup();
    const table = screen.getByRole('grid', { name: '學習單格子' });
    const height = () => parseFloat(table.style.getPropertyValue('--cell-h'));
    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(height()).toBeGreaterThanOrEqual(44);
    const zoomOut = screen.getByRole('button', { name: '縮小' });
    const zoomIn = screen.getByRole('button', { name: '放大' });
    await user.click(zoomOut);
    await user.click(zoomOut);
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(zoomOut).toBeDisabled();
    for (let i = 0; i < 4; i++) await user.click(zoomIn);
    expect(screen.getByText('200%')).toBeInTheDocument();
    expect(zoomIn).toBeDisabled();
    expect(height()).toBeGreaterThanOrEqual(88);
  });

  it('CellMark.current 的格子有 data-current 與加粗外框，其他角標沒有（006 FR-021）', () => {
    render(
      <SheetGrid
        grid={grid}
        onCellClick={vi.fn()}
        marks={{
          C5: { label: '題1', tone: 'question', current: true },
          G5: { label: '答2', tone: 'answer' },
        }}
      />,
    );
    const current = screen.getByRole('gridcell', { name: /^C5/ });
    const other = screen.getByRole('gridcell', { name: /^G5/ });
    expect(current).toHaveAttribute('data-current', 'true');
    expect(current.className).toContain('ring-4');
    expect(within(current).getByText('題1').className).toContain('ring-ink');
    expect(other).not.toHaveAttribute('data-current');
    expect(other.className).not.toContain('ring-4');
    expect(other).toHaveTextContent('答2');
  });

  it('格子區塊自身捲動（頁面不出現水平捲動）', () => {
    render(<SheetGrid grid={grid} onCellClick={vi.fn()} />);
    expect(screen.getByTestId('sheet-grid-scroll').className).toContain('overflow-auto');
  });
});
