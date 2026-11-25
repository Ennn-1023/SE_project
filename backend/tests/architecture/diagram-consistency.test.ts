/**
 * 設計圖與程式碼一致性驗證（憲章原則 VI、001 research R15／tasks T077、003 tasks T088）。
 * 解析 diagrams/001-*、003-*、004-*、005-*、006-*、007-* 的組件圖與類別圖，依各功能 plan.md「設計圖對照表」與
 * 「基礎設施檔案允許清單」確認：
 *  1. 每個組件／類別在對照的檔案中存在並匯出同名符號；
 *  2. 服務、repository 介面、外部整合、PasswordHasher、Clock 的公開方法與類別圖完全一致
 *     （類別圖中 `-` 開頭的私有方法須存在於類別中；標記 <<003>> 等既有功能的類別只需包含圖上列出的方法）；
 *  3. 類別圖中的主要屬性存在於對應型別；
 *  4. routes／services／db／middleware／integrations 下沒有圖表與允許清單以外的檔案。
 * 時序圖的呼叫順序以各功能的 quickstart／驗證文件手動比對（001 T083、003 T089）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

// ---------- plan.md 解析 ----------

function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(heading);
  if (start === -1) throw new Error(`plan.md 缺少段落：${heading}`);
  const rest = markdown.slice(start + heading.length);
  const next = rest.search(/\n#{2,3} /);
  return next === -1 ? rest : rest.slice(0, next);
}

const tableRows = (text: string) =>
  text
    .split('\n')
    .filter((l) => l.trim().startsWith('|') && !/^\|\s*-/.test(l.trim()))
    .map((l) =>
      l
        .trim()
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim()),
    );

/** 正規表示式擷取群組（不存在時為空字串）。 */
const grp = (m: RegExpMatchArray, i: number): string => m[i] ?? '';

const backticks = (cell: string | undefined) =>
  [...(cell ?? '').matchAll(/`([^`]+)`/g)].map((m) => grp(m, 1));

// ---------- PlantUML 解析 ----------

interface DiagramComponent {
  label: string;
  /** 標籤中的英文識別名（例如 LoginPage）；沒有則用第一行中文名稱 */
  key: string;
}

interface DiagramClass {
  kind: 'class' | 'interface' | 'enum';
  name: string;
  /** 例如 <<003>>：引用既有功能的類別，只列出本功能使用的方法 */
  stereotype: string | null;
  methods: string[];
  privateMethods: string[];
  attributes: string[];
  staticMethods: string[];
}

function parseComponents(puml: string): DiagramComponent[] {
  return [
    ...[...puml.matchAll(/\[([^\]]+)\]\s+as\s+\w+/g)].map((m) => {
      const label = grp(m, 1);
      // PlantUML 標籤以字面「\n」換行；取其中整行為英文識別名者（例如「登入頁\nLoginPage」→ LoginPage）
      const parts = label.split('\\n').map((p) => p.trim());
      const ident = parts.find((p) => /^[A-Z][A-Za-z]+$/.test(p));
      return { label, key: ident ?? parts[0] ?? label };
    }),
    // 外部服務（cloud）不對應程式檔案，不列入
    ...[...puml.matchAll(/^(?:database|file)\s+"([^"]+)"/gm)].map((m) => ({
      label: grp(m, 1),
      key: (grp(m, 1).split('\\n')[0] ?? '').trim(),
    })),
  ];
}

/** 解析類別圖；003 的類別位於 package 內有縮排，因此允許行首空白。 */
function parseClasses(puml: string): DiagramClass[] {
  const classes: DiagramClass[] = [];
  for (const m of puml.matchAll(
    /^[ \t]*(abstract class|class|interface|enum)\s+(\w+)(?:\s+<<([^>]+)>>)?\s*(\{([\s\S]*?)^[ \t]*\})?/gm,
  )) {
    const body = m[5] ?? '';
    const lines = body.split('\n').map((l) => l.trim());
    const kind = m[1] === 'abstract class' ? 'class' : (m[1] as DiagramClass['kind']);
    classes.push({
      kind,
      name: grp(m, 2),
      stereotype: m[3] ?? null,
      methods: lines.filter((l) => /^\+\w+\(/.test(l)).map((l) => grp(l.match(/^\+(\w+)\(/)!, 1)),
      privateMethods: lines
        .filter((l) => /^-\w+\(/.test(l))
        .map((l) => grp(l.match(/^-(\w+)\(/)!, 1)),
      staticMethods: lines
        .filter((l) => /^\{static\}\s*[+-]\w+\(/.test(l))
        .map((l) => grp(l.match(/(\w+)\(/)!, 1)),
      attributes: lines
        .filter((l) => /^[+-]\w+\s*:/.test(l))
        .map((l) => grp(l.match(/^[+-](\w+)/)!, 1)),
    });
  }
  return classes;
}

const toPattern = (p: string) =>
  new RegExp('^' + p.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]+') + '$');

/** 一組設計圖（某個功能的 plan 對照表、組件圖、類別圖）。 */
function loadDiagramSet(planPath: string, componentPath: string, classPath: string) {
  const plan = read(planPath);
  const componentMap = new Map<string, string[]>();
  for (const row of tableRows(section(plan, '### 組件圖 → 檔案')).slice(1)) {
    for (let i = 0; i + 1 < row.length; i += 2) {
      const name = row[i];
      if (name) componentMap.set(name, backticks(row[i + 1]));
    }
  }
  const classMap = new Map<string, string[]>();
  for (const row of tableRows(section(plan, '### 類別圖 → 程式型別')).slice(1)) {
    for (const name of backticks(row[0])) classMap.set(name, backticks(row[1]));
  }
  const allowPatterns = tableRows(section(plan, '### 基礎設施檔案允許清單'))
    .slice(1)
    .flatMap((row) => backticks(row[0]))
    .map(toPattern);
  return {
    componentMap,
    classMap,
    allowPatterns,
    components: parseComponents(read(componentPath)),
    classes: parseClasses(read(classPath)),
  };
}

type DiagramSet = ReturnType<typeof loadDiagramSet>;

const set001 = loadDiagramSet(
  'specs/001-foundation-auth-groups/plan.md',
  'diagrams/001-component.puml',
  'diagrams/001-class.puml',
);
const set003 = loadDiagramSet(
  'specs/003-sheets-question-import/plan.md',
  'diagrams/003-component.puml',
  'diagrams/003-class.puml',
);
const set004 = loadDiagramSet(
  'specs/004-activity-control-monitor/plan.md',
  'diagrams/004-component.puml',
  'diagrams/004-class.puml',
);
const set005 = loadDiagramSet(
  'specs/005-sheets-writeback-csv-export/plan.md',
  'diagrams/005-component.puml',
  'diagrams/005-class.puml',
);
const set006 = loadDiagramSet(
  'specs/006-teacher-nav-annotation-paging/plan.md',
  'diagrams/006-component.puml',
  'diagrams/006-class.puml',
);
const set007 = loadDiagramSet(
  'specs/007-answer-countdown-color/plan.md',
  'diagrams/007-component.puml',
  'diagrams/007-class.puml',
);

// ---------- TypeScript 原始碼解析 ----------

function exportsSymbol(source: string, name: string): boolean {
  const re = new RegExp(
    `export\\s+(?:default\\s+)?(?:abstract\\s+)?(?:async\\s+)?(?:class|interface|function|const|type|let|enum)\\s+${name}\\b`,
  );
  return re.test(source);
}

/** 取得 `export (class|interface) Name` 的區塊內容（到第一個位於行首的 `}`）。 */
function block(source: string, kind: 'class' | 'interface', name: string): string | null {
  const start = source.search(new RegExp(`export\\s+${kind}\\s+${name}\\b`));
  if (start === -1) return null;
  const end = source.indexOf('\n}', start);
  return source.slice(start, end === -1 ? undefined : end);
}

function classPublicMethods(body: string): string[] {
  return [...body.matchAll(/^ {2}(?:async\s+)?([a-zA-Z]\w*)\s*(?:<[^>]*>)?\(/gm)]
    .map((m) => grp(m, 1))
    .filter((n) => n !== 'constructor');
}

function interfaceMethods(body: string): string[] {
  return [...body.matchAll(/^ {2}([a-zA-Z]\w*)\s*\(/gm)].map((m) => grp(m, 1));
}

const sorted = (xs: string[]) => [...new Set(xs)].sort();

function fileForClass(set: DiagramSet, name: string): string {
  const files = set.classMap.get(name) ?? [];
  const direct = files.find((f) => /\.(ts|tsx)$/.test(f));
  if (direct) return direct;
  // 「見組件對照表」：服務類別的檔案列在組件對照表
  const fromComponent = (set.componentMap.get(name) ?? []).find((f) => /\.(ts|tsx)$/.test(f));
  if (fromComponent) return fromComponent;
  throw new Error(`plan.md 對照表找不到類別 ${name} 的檔案`);
}

// ---------- 測試 ----------

function describeDiagramSet(
  id: string,
  set: DiagramSet,
  minComponents: number,
  expectedClasses: string[],
) {
  const { components, classes, componentMap } = set;

  describe(`組件圖 ${id}-component ↔ 程式碼`, () => {
    it('解析到組件圖的所有組件', () => {
      expect(components.length).toBeGreaterThanOrEqual(minComponents);
    });

    it.each(components.map((c) => [c.key, c] as const))('%s 有對應檔案與匯出', (key) => {
      const files = componentMap.get(key);
      expect(files, `plan.md 組件對照表缺少「${key}」`).toBeDefined();
      expect(files!.length, `「${key}」沒有列出檔案`).toBeGreaterThan(0);
      const existing = files!.filter((f) => exists(f));
      // .env 不進版控，允許只有範本存在
      expect(existing.length, `「${key}」的檔案都不存在：${files!.join(', ')}`).toBeGreaterThan(0);
      const tsFile = existing.find((f) => /\.(ts|tsx)$/.test(f));
      if (tsFile && /^[A-Z][A-Za-z]+$/.test(key)) {
        const src = read(tsFile);
        const lowerFirst = key.charAt(0).toLowerCase() + key.slice(1);
        expect(
          exportsSymbol(src, key) || exportsSymbol(src, lowerFirst),
          `${tsFile} 未匯出 ${key}（或 ${lowerFirst}）`,
        ).toBe(true);
      }
    });
  });

  describe(`類別圖 ${id}-class ↔ 程式碼`, () => {
    it('解析到類別圖的所有元素', () => {
      expect(classes.map((c) => c.name)).toEqual(expect.arrayContaining(expectedClasses));
    });

    it.each(classes.map((c) => [c.name, c] as const))('%s 在對照檔案中有匯出', (name) => {
      const file = fileForClass(set, name);
      expect(exists(file), `${file} 不存在`).toBe(true);
      expect(exportsSymbol(read(file), name), `${file} 未匯出 ${name}`).toBe(true);
    });

    const withMethods = classes.filter(
      (c) => c.kind !== 'enum' && (c.methods.length > 0 || c.staticMethods.length > 0),
    );

    it.each(withMethods.map((c) => [c.name, c] as const))('%s 的方法與類別圖一致', (name, c) => {
      const file = fileForClass(set, name);
      const src = read(file);
      if (c.kind === 'interface') {
        const body = block(src, 'interface', name);
        expect(body, `${file} 找不到 interface ${name}`).not.toBeNull();
        expect(sorted(interfaceMethods(body!))).toEqual(sorted(c.methods));
        // repository／外部整合的實作類別也須提供相同的公開方法
        for (const impl of componentMap.get(name) ?? []) {
          if (!/\.ts$/.test(impl) || impl === file || !exists(impl)) continue;
          const implBody = block(read(impl), 'class', name);
          expect(implBody, `${impl} 找不到實作類別 ${name}`).not.toBeNull();
          expect(
            sorted(classPublicMethods(implBody!.replace(/^ {2}private [^\n]*$/gm, ''))),
          ).toEqual(sorted(c.methods));
        }
        return;
      }
      const classBody = block(src, 'class', name);
      if (classBody) {
        // 服務類別：公開方法須與類別圖完全一致（private 方法不列入）
        const publicOnly = classBody.replace(/^ {2}(?:private|protected) [^\n]*$/gm, '');
        const publicMethods = classPublicMethods(publicOnly);
        if (c.stereotype && /^\d{3}$/.test(c.stereotype)) {
          // 引用既有功能（例如 <<003>>）的類別：只需包含圖上列出的方法
          expect(publicMethods).toEqual(expect.arrayContaining(c.methods));
        } else {
          expect(sorted(publicMethods)).toEqual(sorted(c.methods));
        }
        for (const m of c.privateMethods) {
          expect(classBody, `${file} 缺少私有方法 ${name}.${m}`).toMatch(
            new RegExp(`^ {2}private (?:async )?${m}\\(`, 'm'),
          );
        }
        return;
      }
      // 實體（純型別）：方法以同名匯出函式實作，例如 isLocked(user, now)
      for (const m of c.methods) {
        expect(
          exportsSymbol(src, m),
          `${file} 缺少 ${name}.${m} 的實作（export function ${m}）`,
        ).toBe(true);
      }
      for (const m of c.staticMethods) {
        expect(src, `${file} 缺少 ${name}.${m}`).toMatch(
          new RegExp(`export const ${name} = \\{[^}]*\\b${m}\\b`),
        );
      }
    });

    const withAttributes = classes.filter((c) => c.attributes.length > 0);

    it.each(withAttributes.map((c) => [c.name, c] as const))('%s 的主要屬性存在', (name, c) => {
      const file = fileForClass(set, name);
      const src = read(file);
      const body = block(src, 'interface', name) ?? block(src, 'class', name);
      expect(body, `${file} 找不到 ${name} 的定義`).not.toBeNull();
      for (const attr of c.attributes) {
        expect(body, `${name}.${attr} 不存在於 ${file}`).toMatch(new RegExp(`\\b${attr}\\b`));
      }
    });
  });
}

describeDiagramSet('001', set001, 25, [
  'User',
  'Session',
  'GroupService',
  'UserRepository',
  'MyGroupView',
]);

describeDiagramSet('003', set003, 30, [
  'AnnotationDocument',
  'ImportDraft',
  'GoogleAuthService',
  'SheetsService',
  'QuestionImportService',
  'QuestionSetService',
  'AnnotationCodec',
  'SheetsGateway',
  'ImportDraftRepository',
]);

describeDiagramSet('004', set004, 34, [
  'Activity',
  'ActivityQuestion',
  'Submission',
  'QuestionResult',
  'ActivityStateMachine',
  'ActivityService',
  'MonitorViewBuilder',
  'ActivityLockGuard',
  'SubmissionService',
  'ResultService',
  'TeacherActivityView',
  'MonitorView',
]);

describeDiagramSet('005', set005, 22, [
  'WritebackTarget',
  'AnswerSlotFallback',
  'WritebackPreview',
  'WritebackItem',
  'WritebackOutcome',
  'PreviewState',
  'CsvResultRow',
  'ExportEvent',
  'ActivityResultReader',
  'WritebackService',
  'CsvExportService',
  'CsvEncoder',
  'WritebackRules',
]);

describeDiagramSet('006', set006, 17, [
  'TeacherNavItem',
  'TeacherLayoutProps',
  'SideMenuProps',
  'AnnotationEditor',
  'QuestionOverviewItem',
  'CellMark',
]);

describeDiagramSet('007', set007, 11, [
  'StudentView',
  'AnsweringView',
  'MonitorBoard',
  'CountdownTimerProps',
  'CountdownTimer',
  'Countdown',
  'useServerCountdown',
  'CountdownPhase',
  'countdownPhase',
]);

describe('程式檔案 ↔ 設計圖對照表（001＋003＋004＋005＋006＋007）', () => {
  it('routes／services／db／middleware／integrations 下沒有圖表與允許清單以外的檔案', () => {
    const mapped = new Set(
      [
        ...set001.componentMap.values(),
        ...set003.componentMap.values(),
        ...set004.componentMap.values(),
        ...set005.componentMap.values(),
        ...set006.componentMap.values(),
        ...set007.componentMap.values(),
      ].flat(),
    );
    const allowed = [
      ...set001.allowPatterns,
      ...set003.allowPatterns,
      ...set004.allowPatterns,
      ...set005.allowPatterns,
      ...set006.allowPatterns,
      ...set007.allowPatterns,
    ];
    const extra: string[] = [];
    for (const dir of ['routes', 'services', 'db', 'middleware', 'integrations/google']) {
      const abs = path.join(ROOT, 'backend/src', dir);
      if (!fs.existsSync(abs)) continue;
      for (const f of fs.readdirSync(abs)) {
        const rel = `backend/src/${dir}/${f}`;
        if (!mapped.has(rel) && !allowed.some((p) => p.test(rel))) extra.push(rel);
      }
    }
    expect(extra, '這些檔案未出現在設計圖對照表或允許清單').toEqual([]);
  });
});
