/** 整合測試用的標註輔助：兩份範例學習單的完整標註與送出流程。 */
import type request from 'supertest';
import type { AnnotatedQuestion } from '@buzzer/shared';

export function question(
  key: string,
  kind: 'SINGLE' | 'GROUP',
  parts: [string | null, string | null][],
  stemCell: string | null = null,
): AnnotatedQuestion {
  return {
    key,
    label: '',
    labelManual: false,
    kind,
    stemCell,
    parts: parts.map(([questionCell, answerCell]) => ({ questionCell, answerCell })),
  };
}

/** 單題範例 6 題（題目 C 欄、作答 G 欄）。 */
export const singleAnnotations = (): AnnotatedQuestion[] =>
  [5, 7, 9, 11, 13, 15].map((row, i) =>
    question(`qs${String(i + 1).padStart(2, '0')}`, 'SINGLE', [[`C${row}`, `G${row}`]]),
  );

/** 題組範例 4 題：第 1、2 題各 2 小題（作答 H 欄），第 3、4 題單題（作答 G 欄）。 */
export const groupAnnotations = (): AnnotatedQuestion[] => [
  question('qg01', 'GROUP', [
    ['C5', 'H5'],
    ['C6', 'H6'],
  ]),
  question('qg02', 'GROUP', [
    ['C8', 'H8'],
    ['C9', 'H9'],
  ]),
  question('qg03', 'SINGLE', [['C11', 'G11']]),
  question('qg04', 'SINGLE', [['C13', 'G13']]),
];

type Agent = ReturnType<typeof request.agent>;

/** 讀取學習單 → 儲存標註，回傳草稿 id。 */
export async function draftWith(agent: Agent, link: string, questions: AnnotatedQuestion[]) {
  const created = await agent.post('/api/question-import/drafts').send({ link });
  if (created.status !== 201)
    throw new Error(`createDraft ${created.status} ${JSON.stringify(created.body)}`);
  const id: string = created.body.draft.id;
  const saved = await agent
    .put(`/api/question-import/drafts/${id}/annotations`)
    .send({ revision: created.body.draft.revision, annotations: { questions } });
  if (saved.status !== 200) throw new Error(`save ${saved.status} ${JSON.stringify(saved.body)}`);
  return { id, draft: created.body.draft };
}

/** 讀取 → 標註 → 確認匯入。 */
export async function importSheet(agent: Agent, link: string, questions: AnnotatedQuestion[]) {
  const { id } = await draftWith(agent, link, questions);
  const res = await agent.post(`/api/question-import/drafts/${id}/confirm`);
  if (res.status !== 200) throw new Error(`confirm ${res.status} ${JSON.stringify(res.body)}`);
  return { id, questionSet: res.body.questionSet };
}
