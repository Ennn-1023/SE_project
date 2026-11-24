/**
 * 窄螢幕（< 640px）時標註面板不遮擋格子與「預覽匯入」（手動驗證情境 13、12 發現的問題；FR-034）。
 */
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../src/api/apiClient';
import { QuestionManagePage } from '../src/pages/QuestionManagePage';
import { draftView } from './questionFixtures';
import { mockMe, renderAt, teacherUser } from './utils';

/** 模擬視窗寬度：narrow = true 代表 < 640px。 */
function mockScreen(narrow: boolean) {
  const listeners = new Set<(e: { matches: boolean }) => void>();
  const mql = {
    matches: narrow,
    media: '(max-width: 639.98px)',
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => listeners.delete(cb),
  };
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => mql),
  );
  return {
    resize(next: boolean) {
      mql.matches = next;
      for (const cb of listeners) cb({ matches: next });
    },
  };
}

beforeEach(() => {
  mockMe(teacherUser);
  vi.spyOn(api, 'getGoogleStatus').mockResolvedValue({ configured: true, connected: true });
  vi.spyOn(api, 'getCurrentDraft').mockResolvedValue({ draft: draftView() });
  vi.spyOn(api, 'getQuestionSet').mockResolvedValue({ questionSet: null });
  vi.spyOn(api, 'saveAnnotations').mockResolvedValue({
    revision: 1,
    annotations: { questions: [] },
    validation: { issues: [], warnings: [], totalIssues: 0 },
    expiresAt: new Date().toISOString(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const renderPage = () => renderAt('/teacher/questions', <QuestionManagePage />);
const body = () => screen.getByTestId('annotation-panel-body');
const cell = (ref: string) => screen.getByRole('gridcell', { name: new RegExp(`^${ref}(：|$)`) });

describe('窄螢幕的標註面板', () => {
  it('開始點選步驟時自動收合，收合列顯示目前步驟；步驟完成後自動展開（正常）', async () => {
    mockScreen(true);
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '新增題目' }));
    expect(body().className).toContain('hidden');
    const bar = screen.getByTestId('annotation-bar');
    expect(bar).toHaveTextContent('請點選第 1 題的題目格');
    await user.click(cell('C5'));
    expect(body().className).toContain('hidden');
    expect(bar).toHaveTextContent('請點選第 1 題的作答格');
    await user.click(cell('G5'));
    await waitFor(() => expect(body().className).not.toContain('hidden'));
  });

  it('收合列提供「預覽匯入」，收合時也按得到', async () => {
    mockScreen(true);
    const preview = vi.spyOn(api, 'previewImport').mockResolvedValue({
      preview: {
        source: draftView().source,
        questionCount: 0,
        slotCount: 0,
        questions: [],
        warnings: [],
      },
      replaces: null,
    });
    renderPage();
    const user = userEvent.setup();
    const bar = await screen.findByTestId('annotation-bar');
    await user.click(within(bar).getByRole('button', { name: '收合' }));
    expect(body().className).toContain('hidden');
    await user.click(within(bar).getByRole('button', { name: '預覽匯入' }));
    expect(preview).toHaveBeenCalled();
  });

  it('寬螢幕（≥ 640px）時不自動收合，收合列不重複出現「預覽匯入」（邊界）', async () => {
    mockScreen(false);
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: '新增題目' }));
    expect(body().className).not.toContain('hidden');
    expect(screen.getAllByRole('button', { name: '預覽匯入' })).toHaveLength(1);
  });

  it('從寬螢幕縮成窄螢幕後，下一次開始步驟時收合', async () => {
    const screenCtl = mockScreen(false);
    renderPage();
    const user = userEvent.setup();
    await screen.findByRole('button', { name: '新增題目' });
    screenCtl.resize(true);
    await user.click(screen.getByRole('button', { name: '新增題目' }));
    await waitFor(() => expect(body().className).toContain('hidden'));
  });
});

// ---------- 004 活動頁（SC-009、FR-033） ----------
import { ActivityControlPage } from '../src/pages/ActivityControlPage';
import { createFakeTeacherSocket, detail, listItem, row, submitted, teacherView } from './activityFixtures';

describe('活動頁版面（004 SC-009、FR-033）', () => {
  function renderActivity(teams: number) {
    const rows = Array.from({ length: teams }, (_, i) =>
      i < 3 ? submitted(`T${i + 1}`, i + 1, '很長的答案'.repeat(60)) : row(`T${i + 1}`),
    );
    vi.spyOn(api, 'getActivity').mockResolvedValue(
      teacherView({
        phase: 'ANSWERING',
        current: detail(1),
        endsAt: new Date(Date.now() + 30_000).toISOString(),
        questions: [listItem(1, { status: 'ANSWERING', round: 1 }), listItem(2), listItem(3)],
        monitor: {
          questionId: 'ACT-1-1',
          round: 1,
          submittedCount: 3,
          teamCount: teams,
          allSubmitted: false,
          teams: rows,
        },
      }),
    );
    const sock = createFakeTeacherSocket();
    const view = renderAt('/teacher/activity', <ActivityControlPage socketFactory={sock.factory} />);
    sock.connection('online');
    return view;
  }

  it.each([10, 50])('%s 組：全部組別可瀏覽；版面為 mobile-first 單欄、桌機才分兩欄', async (teams) => {
    const { container } = renderActivity(teams);
    expect(await screen.findByTestId(`team-T${teams}`)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').filter((li) => li.dataset.testid?.startsWith('team-'))).toHaveLength(teams);
    const columns = container.querySelector('[class~="lg:flex-row-reverse"]');
    expect(columns?.className).toContain('flex-col');
    // 沒有寬度超過手機的固定寬度（只允許 lg: 斷點下的側欄寬度）
    for (const el of container.querySelectorAll('[class]')) {
      const fixed = el.className.toString().split(/\s+/).filter((c) => /^(min-)?w-(\d{3,}|\[\d+px\])/.test(c));
      expect(fixed, el.className.toString()).toEqual([]);
    }
  });

  it('所有按鈕觸控區至少 44px（min-h-11），破壞性操作與主要操作使用不同樣式', async () => {
    renderActivity(10);
    await screen.findByTestId('team-T10');
    for (const button of screen.getAllByRole('button')) {
      expect(button.className, button.textContent ?? '').toMatch(/min-h-11/);
    }
    expect(screen.getByRole('button', { name: '結束搶答' })).toHaveAttribute('data-variant', 'danger');
    expect(screen.getByRole('button', { name: '結束活動' })).toHaveAttribute('data-variant', 'danger');
  });

  it('長答案自動換行並可收合（不造成水平捲動）', async () => {
    renderActivity(10);
    await screen.findByTestId('team-T10');
    for (const text of screen.getAllByTestId('answer-text')) {
      expect(text.querySelector('p')?.className).toContain('break-words');
    }
    expect(screen.getAllByRole('button', { name: '展開完整答案' }).length).toBeGreaterThan(0);
  });
});
