import { useCallback, useState } from 'react';
import {
  cellAt,
  MAX_PARTS,
  MAX_QUESTIONS,
  normalizeToMergeTopLeft,
  partLabel,
  type AnnotatedQuestion,
  type AnnotationDocument,
  type CellRef,
  type GridSnapshot,
  type Issue,
  type QuestionKind,
  type ValidationResult,
} from '@buzzer/shared';
import { Button } from '../components/Button';
import { ErrorMessage } from '../components/ErrorMessage';
import { QuestionOverview } from './QuestionOverview';
import { QuestionPager } from './QuestionPager';
import type { CellMark } from './SheetGrid';

// ---------------------------------------------------------------------------
// 標註操作（spec US2；FR-013～FR-018）
// ---------------------------------------------------------------------------

export type TargetRole = 'question' | 'answer' | 'stem';
export interface Target {
  key: string;
  role: TargetRole;
  /** 小題序（stem 時不使用） */
  part: number;
}

const ROLE_TEXT: Record<TargetRole, string> = {
  question: '題目格',
  answer: '作答格',
  stem: '共同題幹',
};

export function titleOf(q: AnnotatedQuestion, index: number, part?: number): string {
  const base = `第 ${q.label.trim() || index + 1} 題`;
  return q.kind === 'GROUP' && part !== undefined ? `${base}${partLabel(part)}` : base;
}

function newKey(existing: Set<string>): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  for (;;) {
    const bytes = new Uint8Array(8);
    crypto.getRandomValues(bytes);
    const key = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    if (!existing.has(key)) return key;
  }
}

/** 某格目前的角色（排除 except 指定的那一格位置）。 */
function ownerOf(
  doc: AnnotationDocument,
  cell: CellRef,
  except?: Target,
): { key: string; title: string; questionTitle: string; role: TargetRole } | null {
  for (const [qi, q] of doc.questions.entries()) {
    const base = { key: q.key, questionTitle: titleOf(q, qi) };
    if (q.stemCell === cell && !(except?.key === q.key && except.role === 'stem')) {
      return { ...base, title: titleOf(q, qi), role: 'stem' };
    }
    for (const [pi, p] of q.parts.entries()) {
      const same = (role: TargetRole) =>
        except?.key === q.key && except.part === pi && except.role === role;
      if (p.questionCell === cell && !same('question')) {
        return { ...base, title: titleOf(q, qi, pi), role: 'question' };
      }
      if (p.answerCell === cell && !same('answer')) {
        return { ...base, title: titleOf(q, qi, pi), role: 'answer' };
      }
    }
  }
  return null;
}

const emptyPart = () => ({ questionCell: null, answerCell: null });

export interface AnnotationEditor {
  target: Target | null;
  selected: CellRef | null;
  message: string | null;
  stepText: string;
  /** 006：目前這一題的 key；沒有題目時為 null（data-model §3） */
  currentKey: string | null;
  /** 006：目前這一題的位置（0 起算）；沒有題目時為 -1 */
  currentIndex: number;
  /** 006：切到指定題目；先取消進行中的步驟，key 不存在時不動作 */
  goTo: (key: string) => void;
  goPrev: () => void;
  goNext: () => void;
  handleCellClick: (ref: CellRef) => void;
  addQuestion: () => void;
  setKind: (key: string, kind: QuestionKind) => void;
  addPart: (key: string) => void;
  removePart: (key: string, part: number) => void;
  targetStem: (key: string) => void;
  removeStem: (key: string) => void;
  setLabel: (key: string, label: string) => void;
  move: (key: string, delta: -1 | 1) => void;
  removeQuestion: (key: string) => void;
  reassign: (key: string, part: number, role: 'question' | 'answer') => void;
  clearAll: () => void;
  cancelStep: () => void;
}

/**
 * 標註編輯狀態（目前步驟、選取格、提示訊息）與所有操作；doc 由呼叫端保存（useAnnotationDraft）。
 */
export function useAnnotationEditor({
  doc,
  grid,
  onChange,
}: {
  doc: AnnotationDocument;
  grid: GridSnapshot;
  onChange: (doc: AnnotationDocument) => void;
}): AnnotationEditor {
  const [target, setTarget] = useState<Target | null>(null);
  const [selected, setSelected] = useState<CellRef | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [rawKey, setRawKey] = useState<string | null>(null);

  // 目前這一題（006 data-model §3）：rawKey 不在 doc 中時（載入、替換、刪除後）回到第 1 題
  const currentKey = doc.questions.some((q) => q.key === rawKey)
    ? rawKey
    : (doc.questions[0]?.key ?? null);
  const currentIndex = doc.questions.findIndex((q) => q.key === currentKey);

  const goTo = (key: string) => {
    if (!doc.questions.some((q) => q.key === key)) return;
    setTarget(null);
    setMessage(null);
    setRawKey(key);
  };
  const goPrev = () => {
    const prev = doc.questions[currentIndex - 1];
    if (currentIndex > 0 && prev) goTo(prev.key);
  };
  const goNext = () => {
    const next = doc.questions[currentIndex + 1];
    if (currentIndex >= 0 && next) goTo(next.key);
  };

  const update = useCallback(
    (key: string, fn: (q: AnnotatedQuestion) => AnnotatedQuestion) =>
      onChange({ questions: doc.questions.map((q) => (q.key === key ? fn(q) : q)) }),
    [doc, onChange],
  );

  const handleCellClick = (ref: CellRef) => {
    const cell = normalizeToMergeTopLeft(ref, grid.merges);
    setSelected(cell);
    if (!target) {
      setMessage(null);
      return;
    }
    const q = doc.questions.find((x) => x.key === target.key);
    if (!q) {
      setTarget(null);
      return;
    }
    const owner = ownerOf(doc, cell, target);
    if (owner) {
      setMessage(`${cell} 已是${owner.title}的${ROLE_TEXT[owner.role]}，請先移除原本的標註`);
      return;
    }
    if (target.role !== 'answer') {
      const content = cellAt(grid, cell);
      if (content.error) {
        setMessage(`${cell} 的內容是公式錯誤值，請點選其他格子`);
        return;
      }
      if (content.text.trim() === '') {
        setMessage(
          `${cell} 沒有文字，${ROLE_TEXT[target.role]}必須有${target.role === 'stem' ? '內容' : '題目內容'}`,
        );
        return;
      }
    }
    setMessage(null);
    if (target.role === 'stem') {
      update(q.key, (x) => ({ ...x, stemCell: cell }));
      setTarget(null);
      return;
    }
    update(q.key, (x) => ({
      ...x,
      parts: x.parts.map((p, i) =>
        i === target.part
          ? target.role === 'question'
            ? { ...p, questionCell: cell }
            : { ...p, answerCell: cell }
          : p,
      ),
    }));
    const part = q.parts[target.part];
    // 題目格完成後接著點作答格（若作答格尚未指定）
    setTarget(
      target.role === 'question' && part && part.answerCell === null
        ? { ...target, role: 'answer' }
        : null,
    );
  };

  const addQuestion = () => {
    if (doc.questions.length >= MAX_QUESTIONS) {
      setMessage(`題目數已達上限 ${MAX_QUESTIONS} 題`);
      return;
    }
    const key = newKey(new Set(doc.questions.map((q) => q.key)));
    onChange({
      questions: [
        ...doc.questions,
        {
          key,
          label: '',
          labelManual: false,
          kind: 'SINGLE',
          stemCell: null,
          parts: [emptyPart()],
        },
      ],
    });
    setMessage(null);
    setRawKey(key);
    setTarget({ key, role: 'question', part: 0 });
  };

  const setKind = (key: string, kind: QuestionKind) => {
    const q = doc.questions.find((x) => x.key === key);
    if (!q) return;
    if (kind === 'SINGLE' && (q.parts.length > 1 || q.stemCell !== null)) {
      setMessage('題組有多個小題或共同題幹時不能改為單題，請先刪除多餘的小題與共同題幹');
      return;
    }
    const parts = q.parts.length === 0 ? [emptyPart()] : q.parts;
    update(key, (x) => ({ ...x, kind, parts }));
    setMessage(null);
    if (parts[0]!.questionCell === null) setTarget({ key, role: 'question', part: 0 });
  };

  const addPart = (key: string) => {
    const q = doc.questions.find((x) => x.key === key);
    if (!q) return;
    if (q.parts.length >= MAX_PARTS) {
      setMessage(`每題最多 ${MAX_PARTS} 個小題`);
      return;
    }
    update(key, (x) => ({ ...x, parts: [...x.parts, emptyPart()] }));
    setMessage(null);
    setTarget({ key, role: 'question', part: q.parts.length });
  };

  const removePart = (key: string, part: number) => {
    update(key, (x) => ({ ...x, parts: x.parts.filter((_, i) => i !== part) }));
    if (target?.key === key) setTarget(null);
  };

  const targetStem = (key: string) => {
    setMessage(null);
    setTarget({ key, role: 'stem', part: 0 });
  };

  const removeStem = (key: string) => update(key, (x) => ({ ...x, stemCell: null }));

  const setLabel = (key: string, label: string) =>
    update(key, (x) => ({ ...x, label, labelManual: true }));

  const move = (key: string, delta: -1 | 1) => {
    const i = doc.questions.findIndex((q) => q.key === key);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= doc.questions.length) return;
    const questions = [...doc.questions];
    [questions[i], questions[j]] = [questions[j]!, questions[i]!];
    onChange({ questions });
  };

  const removeQuestion = (key: string) => {
    const i = doc.questions.findIndex((q) => q.key === key);
    if (i < 0) return;
    // 刪除目前這一題：顯示原本的後一題；刪的是最後一題則顯示新的最後一題（FR-017）
    if (key === currentKey) {
      const neighbor = doc.questions[i + 1] ?? doc.questions[i - 1];
      setRawKey(neighbor?.key ?? null);
    }
    onChange({ questions: doc.questions.filter((q) => q.key !== key) });
    if (target?.key === key) setTarget(null);
  };

  const reassign = (key: string, part: number, role: 'question' | 'answer') => {
    setMessage(null);
    setTarget({ key, part, role });
  };

  const clearAll = () => {
    onChange({ questions: [] });
    setRawKey(null);
    setTarget(null);
    setMessage(null);
  };

  const cancelStep = () => {
    setTarget(null);
    setMessage(null);
  };

  let stepText = '';
  if (target) {
    const qi = doc.questions.findIndex((q) => q.key === target.key);
    const q = doc.questions[qi];
    if (q) {
      stepText = `請點選${titleOf(q, qi, target.role === 'stem' ? undefined : target.part)}的${ROLE_TEXT[target.role]}`;
    }
  }

  return {
    target,
    selected,
    message,
    stepText,
    currentKey,
    currentIndex,
    goTo,
    goPrev,
    goNext,
    handleCellClick,
    addQuestion,
    setKind,
    addPart,
    removePart,
    targetStem,
    removeStem,
    setLabel,
    move,
    removeQuestion,
    reassign,
    clearAll,
    cancelStep,
  };
}

/**
 * SheetGrid 的角標（題1、答1-2、幹3）。所有題目都有角標；
 * 006：currentKey 那一題的角標標上 current，SheetGrid 以外框醒目顯示（FR-021）。
 */
export function marksFor(
  doc: AnnotationDocument,
  currentKey: string | null = null,
): Record<CellRef, CellMark> {
  const marks: Record<CellRef, CellMark> = {};
  doc.questions.forEach((q, qi) => {
    const label = q.label.trim() || String(qi + 1);
    const extra = q.key === currentKey ? { current: true } : {};
    if (q.stemCell) marks[q.stemCell] = { label: `幹${label}`, tone: 'stem', ...extra };
    q.parts.forEach((p, pi) => {
      const suffix = q.kind === 'GROUP' ? `${label}-${pi + 1}` : label;
      if (p.questionCell) {
        marks[p.questionCell] = { label: `題${suffix}`, tone: 'question', ...extra };
      }
      if (p.answerCell) marks[p.answerCell] = { label: `答${suffix}`, tone: 'answer', ...extra };
    });
  });
  return marks;
}

/** 題目總覽的一個項目（006 data-model §4）。 */
export interface QuestionOverviewItem {
  key: string;
  title: string;
  /** 有會擋下匯入的錯誤（validation.issues）時為 true；只有提醒（warnings）不算 */
  hasIssue: boolean;
  current: boolean;
}

/** 題目總覽（006 FR-022、research R7）。 */
export function overviewOf(
  doc: AnnotationDocument,
  validation: ValidationResult,
  currentKey: string | null,
): QuestionOverviewItem[] {
  const withIssue = new Set(validation.issues.map((i) => i.questionKey).filter(Boolean));
  return doc.questions.map((q, qi) => ({
    key: q.key,
    title: titleOf(q, qi),
    hasIssue: withIssue.has(q.key),
    current: q.key === currentKey,
  }));
}

// ---------------------------------------------------------------------------
// 畫面
// ---------------------------------------------------------------------------

export interface AnnotationPanelProps {
  doc: AnnotationDocument;
  grid: GridSnapshot;
  validation: ValidationResult;
  editor: AnnotationEditor;
}

function IssueList({ items, tone }: { items: Issue[]; tone: 'issue' | 'warning' }) {
  if (items.length === 0) return null;
  return (
    <ul className={`flex flex-col gap-1 text-sm ${tone === 'issue' ? 'text-danger' : 'text-ink'}`}>
      {items.map((i, n) => (
        <li key={`${i.code}-${n}`}>
          {tone === 'issue' ? '⚠ ' : '提醒：'}
          {i.message}
          {i.hint ? `（${i.hint}）` : ''}
        </li>
      ))}
    </ul>
  );
}

const cellText = (grid: GridSnapshot, ref: CellRef) => {
  const t = cellAt(grid, ref).text;
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
};

/** AnnotationPanel（組件圖 003-component、006）：逐題切換、目前步驟、選取格資訊與目前這一題的標註操作。 */
export function AnnotationPanel({ doc, grid, validation, editor }: AnnotationPanelProps) {
  const general = validation.issues.filter((i) => !i.questionKey);
  const selectedOwner = editor.selected ? ownerOf(doc, editor.selected) : null;

  return (
    <section aria-labelledby="annotation-heading" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="annotation-heading" className="text-lg font-bold">
          標註題目（{doc.questions.length} 題）
        </h3>
        <div className="flex flex-wrap gap-2">
          <Button onClick={editor.addQuestion} disabled={doc.questions.length >= MAX_QUESTIONS}>
            新增題目
          </Button>
          {doc.questions.length > 0 ? (
            <Button
              variant="ghost"
              onClick={() => {
                if (
                  window.confirm(
                    '確定要清除所有標註、從頭開始嗎？（試算表上的舊標註會在下次確認匯入時被取代）',
                  )
                ) {
                  editor.clearAll();
                }
              }}
            >
              清除所有標註重新開始
            </Button>
          ) : null}
        </div>
      </div>

      <QuestionOverview
        items={overviewOf(doc, validation, editor.currentKey)}
        onSelect={editor.goTo}
      />

      <QuestionPager
        index={editor.currentIndex}
        total={doc.questions.length}
        onPrev={editor.goPrev}
        onNext={editor.goNext}
      />

      <div className="flex flex-wrap items-center gap-2 rounded-md bg-cream-50 px-3 py-2">
        <p data-testid="annotation-step" aria-live="polite" className="font-medium text-primary">
          {editor.stepText}
        </p>
        {editor.target ? (
          <Button variant="ghost" onClick={editor.cancelStep}>
            取消
          </Button>
        ) : null}
      </div>
      <ErrorMessage message={editor.message} />

      {editor.selected ? (
        <p
          data-testid="selected-cell"
          className="break-all rounded-md bg-cream-50 px-3 py-2 text-sm"
        >
          選取格 {editor.selected}：{cellAt(grid, editor.selected).text || '（空白）'}
          {' — '}
          {selectedOwner ? `${selectedOwner.title}的${ROLE_TEXT[selectedOwner.role]}` : '未標註'}
        </p>
      ) : null}
      {/* 006 FR-020：沒有進行中的步驟、選取格屬於其他題時，可直接前往那一題 */}
      {selectedOwner && !editor.target && selectedOwner.key !== editor.currentKey ? (
        <div>
          <Button variant="secondary" onClick={() => editor.goTo(selectedOwner.key)}>
            前往{selectedOwner.questionTitle}
          </Button>
        </div>
      ) : null}

      <IssueList items={general} tone="issue" />

      {doc.questions.length === 0 ? (
        <p>尚未標註任何題目，請按「新增題目」開始</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {doc.questions.map((q, qi) => {
            // 006 FR-014：一次只顯示目前這一題
            if (qi !== editor.currentIndex) return null;
            const title = titleOf(q, qi);
            const issues = validation.issues.filter((i) => i.questionKey === q.key);
            const warnings = validation.warnings.filter((i) => i.questionKey === q.key);
            return (
              <li
                key={q.key}
                aria-label={title}
                className="flex flex-col gap-2 rounded-lg border border-cream-300 bg-cream-50 p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <label className="flex items-center gap-1">
                    <span>第</span>
                    <input
                      aria-label={`${title}的題號`}
                      value={q.label}
                      onChange={(e) => editor.setLabel(q.key, e.target.value)}
                      className="min-h-11 w-20 rounded-md border border-cream-300 bg-cream-50 px-2"
                    />
                    <span>題</span>
                  </label>
                  <span className="text-sm">{q.kind === 'GROUP' ? '題組' : '單題'}</span>
                  <Button
                    variant="ghost"
                    aria-label={`${title}改為${q.kind === 'GROUP' ? '單題' : '題組'}`}
                    onClick={() => editor.setKind(q.key, q.kind === 'GROUP' ? 'SINGLE' : 'GROUP')}
                  >
                    改為{q.kind === 'GROUP' ? '單題' : '題組'}
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`${title}上移`}
                    disabled={qi === 0}
                    onClick={() => editor.move(q.key, -1)}
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`${title}下移`}
                    disabled={qi === doc.questions.length - 1}
                    onClick={() => editor.move(q.key, 1)}
                  >
                    ↓
                  </Button>
                  <Button
                    variant="ghost"
                    aria-label={`${title}刪除`}
                    onClick={() => editor.removeQuestion(q.key)}
                  >
                    刪除
                  </Button>
                </div>

                {q.kind === 'GROUP' ? (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    {q.stemCell ? (
                      <span className="break-all">
                        共同題幹 {q.stemCell}：{cellText(grid, q.stemCell)}
                      </span>
                    ) : (
                      <span>（沒有共同題幹）</span>
                    )}
                    <Button
                      variant="ghost"
                      aria-label={`${title}設定共同題幹`}
                      onClick={() => editor.targetStem(q.key)}
                    >
                      {q.stemCell ? '重新指定共同題幹' : '設定共同題幹'}
                    </Button>
                    {q.stemCell ? (
                      <Button
                        variant="ghost"
                        aria-label={`${title}移除共同題幹`}
                        onClick={() => editor.removeStem(q.key)}
                      >
                        移除題幹
                      </Button>
                    ) : null}
                  </div>
                ) : null}

                <ul className="flex flex-col gap-2">
                  {q.parts.map((p, pi) => {
                    const partTitle = titleOf(q, qi, q.kind === 'GROUP' ? pi : undefined);
                    return (
                      <li key={pi} className="flex flex-col gap-1 text-sm">
                        {q.kind === 'GROUP' ? (
                          <span className="font-medium">{partLabel(pi)}</span>
                        ) : null}
                        <span className="break-all">
                          題目格 {p.questionCell ?? '（未指定）'}
                          {p.questionCell ? `：${cellText(grid, p.questionCell)}` : ''}
                        </span>
                        <span>作答格 {p.answerCell ?? '（未指定）'}</span>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="ghost"
                            aria-label={`${partTitle}重新指定題目格`}
                            onClick={() => editor.reassign(q.key, pi, 'question')}
                          >
                            指定題目格
                          </Button>
                          <Button
                            variant="ghost"
                            aria-label={`${partTitle}重新指定作答格`}
                            onClick={() => editor.reassign(q.key, pi, 'answer')}
                          >
                            指定作答格
                          </Button>
                          {q.kind === 'GROUP' ? (
                            <Button
                              variant="ghost"
                              aria-label={`${partTitle}刪除小題`}
                              onClick={() => editor.removePart(q.key, pi)}
                            >
                              刪除小題
                            </Button>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {q.kind === 'GROUP' ? (
                  <div>
                    <Button
                      variant="secondary"
                      aria-label={`${title}新增小題`}
                      disabled={q.parts.length >= MAX_PARTS}
                      onClick={() => editor.addPart(q.key)}
                    >
                      新增小題
                    </Button>
                  </div>
                ) : null}
                <IssueList items={issues} tone="issue" />
                <IssueList items={warnings} tone="warning" />
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
