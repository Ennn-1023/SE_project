/** US2：互動標註（AnnotationPanel＋SheetGrid，spec US2 情境 1～9）。 */
import { useState } from 'react';
import { act, render, renderHook, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { autoNumber, validateAnnotations, type AnnotationDocument } from '@buzzer/shared';
import {
  AnnotationPanel,
  marksFor,
  overviewOf,
  useAnnotationEditor,
} from '../src/questions/AnnotationPanel';
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
        marks={marksFor(doc, editor.currentKey)}
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
    // 006：一次只顯示一題，先回到第 1 題再刪除
    await user.click(screen.getByRole('button', { name: '上一題' }));
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

// ---------------------------------------------------------------------------
// 006 US3：一次只顯示一題（FR-014～FR-021、FR-023；data-model §3 CurrentQuestion）
// ---------------------------------------------------------------------------

/** 題目格有文字的格子（groupGrid）；作答格可為空白。 */
const SLOTS: [string, string][] = [
  ['C5', 'H5'],
  ['C6', 'H6'],
  ['C11', 'I11'],
  ['C13', 'I13'],
  ['G5', 'I5'],
];

async function addMany(user: ReturnType<typeof userEvent.setup>, n: number, from = 0) {
  for (const [q, a] of SLOTS.slice(from, from + n)) await addSingle(user, q, a);
}

const position = () => screen.getByTestId('question-position');
const cards = () => screen.queryAllByRole('listitem', { name: /^第 .+ 題$/ });
const currentCard = () => {
  const all = cards();
  expect(all).toHaveLength(1);
  return all[0]!;
};

/** 可從外部替換 doc 的 harness（模擬重新載入草稿）。 */
function ReplaceHarness({
  first,
  second,
}: {
  first: AnnotationDocument;
  second: AnnotationDocument;
}) {
  const [doc, setDoc] = useState<AnnotationDocument>(first);
  const editor = useAnnotationEditor({
    doc,
    grid: groupGrid,
    onChange: (d) => setDoc(autoNumber(d)),
  });
  const validation = validateAnnotations(doc, groupGrid, { complete: false });
  return (
    <>
      <button type="button" onClick={() => setDoc(second)}>
        替換
      </button>
      <AnnotationPanel doc={doc} grid={groupGrid} validation={validation} editor={editor} />
    </>
  );
}

const single = (key: string, label: string, q: string, a: string) => ({
  key,
  label,
  labelManual: false,
  kind: 'SINGLE' as const,
  stemCell: null,
  parts: [{ questionCell: q, answerCell: a }],
});

describe('AnnotationPanel：逐題切換（006 US3）', () => {
  it('新增題目後切到新題並進入題目格步驟；位置提示更新（US3-3、FR-016）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 4);
    expect(position()).toHaveTextContent('第 4 題／共 4 題');
    await user.click(screen.getByRole('button', { name: '新增題目' }));
    expect(position()).toHaveTextContent('第 5 題／共 5 題');
    expect(currentCard()).toHaveAccessibleName('第 5 題');
    expect(step()).toHaveTextContent('請點選第 5 題的題目格');
  });

  it('上一題／下一題切換，只顯示目前這一題（US3-1、FR-014、FR-015）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 5);
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: '上一題' }));
    expect(position()).toHaveTextContent('第 2 題／共 5 題');
    await user.click(screen.getByRole('button', { name: '下一題' }));
    expect(position()).toHaveTextContent('第 3 題／共 5 題');
    expect(within(currentCard()).getByText(/題目格 C11/)).toBeInTheDocument();
  });

  it('不論幾題，畫面上都只有 1 張編輯卡片（SC-002 結構斷言）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 1);
    expect(cards()).toHaveLength(1);
    await addMany(user, 4, 1);
    expect(cards()).toHaveLength(1);
  });

  it('刪除目前這一題：顯示原本的後一題（US3-5、FR-017）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 5);
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: '上一題' }));
    expect(position()).toHaveTextContent('第 3 題／共 5 題');
    await user.click(screen.getByRole('button', { name: '第 3 題刪除' }));
    expect(position()).toHaveTextContent('第 3 題／共 4 題');
    expect(within(currentCard()).getByText(/題目格 C13/)).toBeInTheDocument();
  });

  it('刪除最後一題：顯示新的最後一題；刪光後顯示空狀態（US3-5，邊界）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 2);
    await user.click(screen.getByRole('button', { name: '第 2 題刪除' }));
    expect(position()).toHaveTextContent('第 1 題／共 1 題');
    expect(within(currentCard()).getByText(/題目格 C5/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '第 1 題刪除' }));
    expect(screen.getByText('尚未標註任何題目，請按「新增題目」開始')).toBeInTheDocument();
    expect(screen.queryByTestId('question-pager')).toBeNull();
  });

  it('刪除其他題時目前這一題不變；goTo 不存在的 key 不動作（data-model §3，邊界）', () => {
    let doc: AnnotationDocument = {
      questions: [
        single('k1', '1', 'C5', 'H5'),
        single('k2', '2', 'C6', 'H6'),
        single('k3', '3', 'C11', 'I11'),
      ],
    };
    const { result, rerender } = renderHook(() =>
      useAnnotationEditor({ doc, grid: groupGrid, onChange: (d) => (doc = d) }),
    );
    act(() => result.current.goTo('k2'));
    rerender();
    act(() => result.current.removeQuestion('k3'));
    rerender();
    expect(result.current.currentKey).toBe('k2');
    expect(result.current.currentIndex).toBe(1);
    act(() => result.current.goTo('nope'));
    rerender();
    expect(result.current.currentKey).toBe('k2');
  });

  it('下移後畫面跟著同一題，位置提示更新（US3-6、FR-018）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 3);
    for (let i = 0; i < 2; i++) await user.click(screen.getByRole('button', { name: '上一題' }));
    expect(within(currentCard()).getByText(/題目格 C5/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '第 1 題下移' }));
    expect(position()).toHaveTextContent('第 2 題／共 3 題');
    expect(within(currentCard()).getByText(/題目格 C5/)).toBeInTheDocument();
  });

  it('指定作答格的步驟中切題會先取消步驟，之後點格子不指定給任何題（US3-8、FR-019，邊界）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 2);
    await user.click(screen.getByRole('button', { name: '上一題' }));
    await user.click(screen.getByRole('button', { name: '第 1 題重新指定作答格' }));
    expect(step()).toHaveTextContent('請點選第 1 題的作答格');
    await user.click(screen.getByRole('button', { name: '下一題' }));
    expect(step()).toHaveTextContent('');
    const before = JSON.stringify(docOf());
    await user.click(cell('I9'));
    expect(JSON.stringify(docOf())).toBe(before);
  });

  it('選取屬於其他題的格子時可「前往第 N 題」；步驟進行中則不提供（US3-7、FR-020）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 3);
    // 目前在第 3 題，點第 1 題的題目格
    await user.click(cell('C5'));
    await user.click(screen.getByRole('button', { name: '前往第 1 題' }));
    expect(position()).toHaveTextContent('第 1 題／共 3 題');
    // 點自己的格子不出現前往按鈕
    await user.click(cell('C5'));
    expect(screen.queryByRole('button', { name: /^前往/ })).toBeNull();
    // 步驟進行中點到其他題的格子：只顯示佔用訊息
    await user.click(screen.getByRole('button', { name: '第 1 題重新指定作答格' }));
    await user.click(cell('C6'));
    expect(screen.getByText(/已是第 2 題的題目格/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^前往/ })).toBeNull();
  });

  it('格線保留所有角標，只有目前這一題標為 current（US3-9、FR-021）', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await addMany(user, 2);
    expect(cell('C5')).toHaveTextContent('題1');
    expect(cell('C5')).not.toHaveAttribute('data-current');
    expect(cell('C6')).toHaveAttribute('data-current', 'true');
    expect(cell('H6')).toHaveAttribute('data-current', 'true');
  });

  it('清除所有標註後顯示空狀態，新增的第一題成為目前這一題（Edge Cases）', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<Harness />);
    await addMany(user, 3);
    await user.click(screen.getByRole('button', { name: '清除所有標註重新開始' }));
    expect(screen.getByText('尚未標註任何題目，請按「新增題目」開始')).toBeInTheDocument();
    await addMany(user, 1);
    expect(position()).toHaveTextContent('第 1 題／共 1 題');
    confirm.mockRestore();
  });

  it('載入或替換標註時預設顯示第 1 題（FR-023）', async () => {
    const user = userEvent.setup();
    const first = { questions: [single('k1', '1', 'C5', 'H5'), single('k2', '2', 'C6', 'H6')] };
    const second = {
      questions: [single('m1', '1', 'C11', 'H11'), single('m2', '2', 'C13', 'H13')],
    };
    render(<ReplaceHarness first={first} second={second} />);
    expect(position()).toHaveTextContent('第 1 題／共 2 題');
    await user.click(screen.getByRole('button', { name: '下一題' }));
    expect(position()).toHaveTextContent('第 2 題／共 2 題');
    await user.click(screen.getByRole('button', { name: '替換' }));
    expect(position()).toHaveTextContent('第 1 題／共 2 題');
    expect(within(currentCard()).getByText(/題目格 C11/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// 006 US4：題目總覽（FR-022；data-model §4 QuestionOverviewItem）
// ---------------------------------------------------------------------------

/** 以完整驗證（complete: true）呈現的 harness，缺作答格會成為錯誤。 */
function OverviewHarness({ initial }: { initial: AnnotationDocument }) {
  const [doc, setDoc] = useState<AnnotationDocument>(initial);
  const editor = useAnnotationEditor({
    doc,
    grid: groupGrid,
    onChange: (d) => setDoc(autoNumber(d)),
  });
  const validation = validateAnnotations(doc, groupGrid, { complete: true });
  return (
    <>
      <SheetGrid
        grid={groupGrid}
        onCellClick={editor.handleCellClick}
        marks={marksFor(doc, editor.currentKey)}
        selected={editor.selected}
      />
      <AnnotationPanel doc={doc} grid={groupGrid} validation={validation} editor={editor} />
    </>
  );
}

const sixQuestions = (): AnnotationDocument => ({
  questions: [
    single('k1', '1', 'C5', 'H5'),
    { ...single('k2', '2', 'C6', 'H6'), parts: [{ questionCell: 'C6', answerCell: null }] },
    single('k3', '3', 'C11', 'I11'),
    // 作答格已有內容：只是提醒（warning），不算錯誤
    single('k4', '4', 'C13', 'G13'),
    { ...single('k5', '5', 'G5', 'I5'), parts: [{ questionCell: 'G5', answerCell: null }] },
    single('k6', '6', 'G6', 'I6'),
  ],
});

describe('AnnotationPanel：題目總覽（006 US4）', () => {
  it('overviewOf 只把有 issues 的題目標成 hasIssue，warnings 不算（US4-1）', () => {
    const doc = sixQuestions();
    const validation = validateAnnotations(doc, groupGrid, { complete: true });
    expect(validation.warnings.some((w) => w.questionKey === 'k4')).toBe(true);
    const items = overviewOf(doc, validation, 'k3');
    expect(items.filter((i) => i.hasIssue).map((i) => i.key)).toEqual(['k2', 'k5']);
    expect(items.filter((i) => i.current).map((i) => i.key)).toEqual(['k3']);
    expect(items[0]!.title).toBe('第 1 題');
  });

  it('總覽只標示第 2、5 題；點第 5 題切過去並顯示該題錯誤（US4-1、US4-2）', async () => {
    render(<OverviewHarness initial={sixQuestions()} />);
    const nav = screen.getByRole('navigation', { name: '題目總覽' });
    const flagged = within(nav)
      .getAllByRole('button')
      .filter((b) => b.textContent?.startsWith('⚠'))
      .map((b) => b.getAttribute('aria-label'));
    expect(flagged).toEqual(['第 2 題，有錯誤', '第 5 題，有錯誤']);
    await userEvent.setup().click(within(nav).getByRole('button', { name: '第 5 題，有錯誤' }));
    expect(position()).toHaveTextContent('第 5 題／共 6 題');
    expect(within(currentCard()).getByText(/題目格 G5/)).toBeInTheDocument();
    expect(within(currentCard()).getByText(/作答格 （未指定）/)).toBeInTheDocument();
  });

  it('修正第 2 題的錯誤後，錯誤標示立即消失（US4-3）', async () => {
    const user = userEvent.setup();
    render(<OverviewHarness initial={sixQuestions()} />);
    const nav = screen.getByRole('navigation', { name: '題目總覽' });
    await user.click(within(nav).getByRole('button', { name: '第 2 題，有錯誤' }));
    await user.click(screen.getByRole('button', { name: '第 2 題重新指定作答格' }));
    await user.click(cell('H6'));
    expect(within(nav).getByRole('button', { name: '第 2 題' })).toBeInTheDocument();
    expect(within(nav).queryByRole('button', { name: '第 2 題，有錯誤' })).toBeNull();
  });
});
