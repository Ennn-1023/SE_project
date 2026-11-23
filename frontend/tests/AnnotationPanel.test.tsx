/** US2：互動標註（AnnotationPanel＋SheetGrid，spec US2 情境 1～9）。 */
import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { autoNumber, validateAnnotations, type AnnotationDocument } from '@buzzer/shared';
import { AnnotationPanel, marksFor, useAnnotationEditor } from '../src/questions/AnnotationPanel';
import { SheetGrid } from '../src/questions/SheetGrid';
import { groupGrid } from './questionFixtures';

function Harness({ initial = { questions: [] } }: { initial?: AnnotationDocument }) {
  const [doc, setDoc] = useState<AnnotationDocument>(initial);
  const editor = useAnnotationEditor({
    doc,
    grid: groupGrid,
    onChange: (d) => setDoc(autoNumber(d)),
  });
  const validation = validateAnnotations(doc, groupGrid, { complete: false });
  return (
    <>
      <SheetGrid
        grid={groupGrid}
        onCellClick={editor.handleCellClick}
        marks={marksFor(doc)}
        selected={editor.selected}
      />
      <AnnotationPanel doc={doc} grid={groupGrid} validation={validation} editor={editor} />
      <pre data-testid="doc">{JSON.stringify(doc)}</pre>
    </>
  );
}

const docOf = (): AnnotationDocument => JSON.parse(screen.getByTestId('doc').textContent!);
const cell = (ref: string) => screen.getByRole('gridcell', { name: new RegExp(`^${ref}(：|$)`) });
const step = () => screen.getByTestId('annotation-step');

async function addSingle(user: ReturnType<typeof userEvent.setup>, q: string, a: string) {
  await user.click(screen.getByRole('button', { name: '新增題目' }));
  await user.click(cell(q));
  await user.click(cell(a));
}

describe('AnnotationPanel', () => {
  it('新增單題：依步驟點題目格、作答格，清單與格子角標同步（正常）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(screen.getByText('尚未標註任何題目，請按「新增題目」開始')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '新增題目' }));
    expect(step()).toHaveTextContent('請點選第 1 題的題目格');
    await user.click(cell('C5'));
    expect(step()).toHaveTextContent('請點選第 1 題的作答格');
    await user.click(cell('H5'));
    expect(step()).toHaveTextContent('');
    expect(docOf().questions[0]).toMatchObject({
      label: '1',
      kind: 'SINGLE',
      parts: [{ questionCell: 'C5', answerCell: 'H5' }],
    });
    const item = screen.getByRole('listitem', { name: '第 1 題' });
    expect(within(item).getByText(/題目格 C5/)).toBeInTheDocument();
    expect(within(item).getByText(/作答格 H5/)).toBeInTheDocument();
    expect(cell('C5')).toHaveTextContent('題1');
    expect(cell('H5')).toHaveTextContent('答1');
  });

  it('新增第二題自動編號為 2；修改題號後保持不變（FR-017）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addSingle(user, 'C5', 'H5');
    await addSingle(user, 'C6', 'H6');
    expect(docOf().questions.map((q) => q.label)).toEqual(['1', '2']);
    const input = screen.getByLabelText('第 2 題的題號');
    await user.clear(input);
    await user.type(input, 'Q2');
    expect(docOf().questions[1]).toMatchObject({ label: 'Q2', labelManual: true });
    // 上移後未手動修改的題號重新編號，手動修改的保持
    await user.click(screen.getByRole('button', { name: '第 Q2 題上移' }));
    expect(docOf().questions.map((q) => q.label)).toEqual(['Q2', '2']);
  });

  it('題組：多個小題、標籤（1）（2）與共同題幹（US2 情境 3、4）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '新增題目' }));
    await user.click(screen.getByRole('button', { name: '第 1 題改為題組' }));
    expect(step()).toHaveTextContent('請點選第 1 題（1）的題目格');
    await user.click(cell('C5'));
    await user.click(cell('H5'));
    await user.click(screen.getByRole('button', { name: '第 1 題新增小題' }));
    expect(step()).toHaveTextContent('請點選第 1 題（2）的題目格');
    await user.click(cell('C6'));
    await user.click(cell('H6'));
    await user.click(screen.getByRole('button', { name: '第 1 題設定共同題幹' }));
    expect(step()).toHaveTextContent('請點選第 1 題的共同題幹');
    await user.click(cell('A2'));
    expect(docOf().questions[0]).toMatchObject({
      kind: 'GROUP',
      stemCell: 'A2',
      parts: [
        { questionCell: 'C5', answerCell: 'H5' },
        { questionCell: 'C6', answerCell: 'H6' },
      ],
    });
    const item = screen.getByRole('listitem', { name: '第 1 題' });
    expect(within(item).getByText('（1）')).toBeInTheDocument();
    expect(within(item).getByText('（2）')).toBeInTheDocument();
    expect(within(item).getByText(/共同題幹 A2/)).toBeInTheDocument();
    expect(cell('H6')).toHaveTextContent('答1-2');
    expect(cell('A2')).toHaveTextContent('幹1');
  });

  it('點合併範圍內的格子時選取整個合併格（左上角）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addSingle(user, 'C11', 'G11');
    expect(docOf().questions[0]!.parts[0]).toEqual({ questionCell: 'C11', answerCell: 'G11' });
  });

  it('同一格重複指定時拒絕並說明原本的角色（US2 情境 6、邊界）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addSingle(user, 'C5', 'H5');
    await user.click(screen.getByRole('button', { name: '新增題目' }));
    await user.click(cell('C6'));
    await user.click(cell('H5'));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'H5 已是第 1 題的作答格，請先移除原本的標註',
    );
    expect(step()).toHaveTextContent('請點選第 2 題的作答格');
    expect(docOf().questions[1]!.parts[0]!.answerCell).toBeNull();
  });

  it('題目格沒有文字時拒絕（US2 情境 7、邊界）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: '新增題目' }));
    await user.click(cell('D8'));
    expect(screen.getByRole('alert')).toHaveTextContent('D8 沒有文字，題目格必須有題目內容');
    expect(step()).toHaveTextContent('請點選第 1 題的題目格');
  });

  it('作答格已有內容時允許，並顯示提醒（US2 情境 8）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addSingle(user, 'C13', 'G13');
    expect(docOf().questions[0]!.parts[0]!.answerCell).toBe('G13');
    expect(screen.getByText(/作答格 G13 已有內容/)).toBeInTheDocument();
  });

  it('重新指定作答格、刪除小題與刪除題目（US2 情境 9）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addSingle(user, 'C5', 'H5');
    await user.click(screen.getByRole('button', { name: '第 1 題重新指定作答格' }));
    expect(step()).toHaveTextContent('請點選第 1 題的作答格');
    await user.click(cell('I5'));
    expect(docOf().questions[0]!.parts[0]!.answerCell).toBe('I5');
    expect(cell('H5')).not.toHaveTextContent('答1');
    await addSingle(user, 'C6', 'H6');
    await user.click(screen.getByRole('button', { name: '第 1 題刪除' }));
    expect(docOf().questions).toHaveLength(1);
    expect(docOf().questions[0]).toMatchObject({ label: '1', parts: [{ questionCell: 'C6' }] });
  });

  it('沒有進行中的步驟時點選格子，顯示該格完整文字與目前角色', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addSingle(user, 'C5', 'H5');
    await user.click(cell('C5'));
    const info = screen.getByTestId('selected-cell');
    expect(info).toHaveTextContent('C5');
    expect(info).toHaveTextContent('小題 1-1？');
    expect(info).toHaveTextContent('第 1 題的題目格');
  });
});
