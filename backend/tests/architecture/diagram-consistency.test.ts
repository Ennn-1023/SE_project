/**
 * 設計圖與程式碼一致性驗證（憲章原則 VI、research R15、tasks T077）。
 * 解析 diagrams/001-component.puml 與 001-class.puml，依 plan.md「設計圖對照表」與
 * 「基礎設施檔案允許清單」確認：
 *  1. 每個組件／類別在對照的檔案中存在並匯出同名符號；
 *  2. 服務、repository 介面、PasswordHasher、Clock 的公開方法與類別圖完全一致；
 *  3. 類別圖中的主要屬性存在於對應型別；
 *  4. routes／services／db／middleware 下沒有圖表與允許清單以外的檔案。
 * 時序圖的呼叫順序以 quickstart.md §8 手動比對（T083）。
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel: string) => fs.existsSync(path.join(ROOT, rel));

const plan = read('specs/001-foundation-auth-groups/plan.md');
const componentPuml = read('diagrams/001-component.puml');
const classPuml = read('diagrams/001-class.puml');

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

const backticks = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

/** 組件圖 → 檔案（每列兩組「組件｜檔案」）。 */
const componentMap = new Map<string, string[]>();
for (const row of tableRows(section(plan, '### 組件圖 → 檔案')).slice(1)) {
  for (let i = 0; i + 1 < row.length; i += 2) {
    if (row[i]) componentMap.set(row[i], backticks(row[i + 1]));
  }
}

/** 類別圖 → 程式型別。 */
const classMap = new Map<string, string[]>();
for (const row of tableRows(section(plan, '### 類別圖 → 程式型別')).slice(1)) {
  for (const name of backticks(row[0])) classMap.set(name, backticks(row[1]));
}

/** 基礎設施檔案允許清單（支援 * 萬用字元）。 */
const allowPatterns = tableRows(section(plan, '### 基礎設施檔案允許清單'))
  .slice(1)
  .flatMap((row) => backticks(row[0]))
  .map((p) => new RegExp('^' + p.replace(/[.]/g, '\\.').replace(/\*/g, '[^/]+') + '$'));

// ---------- PlantUML 解析 ----------

interface DiagramComponent {
  label: string;
  /** 標籤中的英文識別名（例如 LoginPage）；沒有則用第一行中文名稱 */
  key: string;
}

const components: DiagramComponent[] = [
  ...[...componentPuml.matchAll(/\[([^\]]+)\]\s+as\s+\w+/g)].map((m) => {
    const label = m[1];
    // PlantUML 標籤以字面「\n」換行；取其中整行為英文識別名者（例如「登入頁\nLoginPage」→ LoginPage）
    const parts = label.split('\\n').map((p) => p.trim());
    const ident = parts.find((p) => /^[A-Z][A-Za-z]+$/.test(p));
    return { label, key: ident ?? parts[0] };
  }),
  ...[...componentPuml.matchAll(/^(?:database|file)\s+"([^"]+)"/gm)].map((m) => ({
    label: m[1],
    key: m[1].split('\\n')[0].trim(),
  })),
];

interface DiagramClass {
  kind: 'class' | 'interface' | 'enum';
  name: string;
  methods: string[];
  attributes: string[];
  staticMethods: string[];
}

const classes: DiagramClass[] = [];
for (const m of classPuml.matchAll(
  /^(abstract class|class|interface|enum)\s+(\w+)(?:\s+<<[^>]+>>)?\s*(\{([\s\S]*?)^\})?/gm,
)) {
  const body = m[4] ?? '';
  const lines = body.split('\n').map((l) => l.trim());
  const kind = m[1] === 'abstract class' ? 'class' : (m[1] as DiagramClass['kind']);
  classes.push({
    kind,
    name: m[2],
    methods: lines.filter((l) => /^[+-]\w+\(/.test(l)).map((l) => l.match(/^[+-](\w+)\(/)![1]),
    staticMethods: lines
      .filter((l) => /^\{static\}\s*[+-]\w+\(/.test(l))
      .map((l) => l.match(/(\w+)\(/)![1]),
    attributes: lines.filter((l) => /^[+-]\w+\s*:/.test(l)).map((l) => l.match(/^[+-](\w+)/)![1]),
  });
}

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
    .map((m) => m[1])
    .filter((n) => n !== 'constructor');
}

function interfaceMethods(body: string): string[] {
  return [...body.matchAll(/^ {2}([a-zA-Z]\w*)\s*\(/gm)].map((m) => m[1]);
}

const sorted = (xs: string[]) => [...new Set(xs)].sort();

function fileForClass(name: string): string {
  const files = classMap.get(name) ?? [];
  const direct = files.find((f) => /\.(ts|tsx)$/.test(f));
  if (direct) return direct;
  // 「見組件對照表」：服務類別的檔案列在組件對照表
  const fromComponent = (componentMap.get(name) ?? []).find((f) => /\.(ts|tsx)$/.test(f));
  if (fromComponent) return fromComponent;
  throw new Error(`plan.md 對照表找不到類別 ${name} 的檔案`);
}

// ---------- 測試 ----------

describe('組件圖 001-component ↔ 程式碼', () => {
  it('解析到組件圖的所有組件', () => {
    expect(components.length).toBeGreaterThanOrEqual(25);
  });

  it.each(components.map((c) => [c.key, c] as const))('%s 有對應檔案與匯出', (key, c) => {
    const files = componentMap.get(key);
    expect(files, `plan.md 組件對照表缺少「${key}」`).toBeDefined();
    expect(files!.length, `「${key}」沒有列出檔案`).toBeGreaterThan(0);
    const existing = files!.filter((f) => exists(f));
    // .env 不進版控，允許只有範本存在
    expect(existing.length, `「${key}」的檔案都不存在：${files!.join(', ')}`).toBeGreaterThan(0);
    const tsFile = existing.find((f) => /\.(ts|tsx)$/.test(f));
    if (tsFile && /^[A-Z][A-Za-z]+$/.test(key)) {
      const src = read(tsFile);
      const lowerFirst = key[0].toLowerCase() + key.slice(1);
      expect(
        exportsSymbol(src, key) || exportsSymbol(src, lowerFirst),
        `${tsFile} 未匯出 ${key}（或 ${lowerFirst}）`,
      ).toBe(true);
    }
    void c;
  });

  it('routes／services／db／middleware 下沒有圖表與允許清單以外的檔案', () => {
    const mapped = new Set([...componentMap.values()].flat());
    const extra: string[] = [];
    for (const dir of ['routes', 'services', 'db', 'middleware']) {
      for (const f of fs.readdirSync(path.join(ROOT, 'backend/src', dir))) {
        const rel = `backend/src/${dir}/${f}`;
        if (!mapped.has(rel) && !allowPatterns.some((p) => p.test(rel))) extra.push(rel);
      }
    }
    expect(extra, '這些檔案未出現在設計圖對照表或允許清單').toEqual([]);
  });
});

describe('類別圖 001-class ↔ 程式碼', () => {
  it('解析到類別圖的所有元素', () => {
    expect(classes.map((c) => c.name)).toEqual(
      expect.arrayContaining(['User', 'Session', 'GroupService', 'UserRepository', 'MyGroupView']),
    );
  });

  it.each(classes.map((c) => [c.name, c] as const))('%s 在對照檔案中有匯出', (name) => {
    const file = fileForClass(name);
    expect(exists(file), `${file} 不存在`).toBe(true);
    expect(exportsSymbol(read(file), name), `${file} 未匯出 ${name}`).toBe(true);
  });

  const withMethods = classes.filter(
    (c) => c.kind !== 'enum' && (c.methods.length > 0 || c.staticMethods.length > 0),
  );

  it.each(withMethods.map((c) => [c.name, c] as const))('%s 的方法與類別圖一致', (name, c) => {
    const file = fileForClass(name);
    const src = read(file);
    if (c.kind === 'interface') {
      const body = block(src, 'interface', name);
      expect(body, `${file} 找不到 interface ${name}`).not.toBeNull();
      expect(sorted(interfaceMethods(body!))).toEqual(sorted(c.methods));
      // repository／hasher 的實作類別也須提供相同的公開方法
      for (const impl of componentMap.get(name) ?? []) {
        if (!/\.ts$/.test(impl) || impl === file || !exists(impl)) continue;
        const implBody = block(read(impl), 'class', name);
        expect(implBody, `${impl} 找不到實作類別 ${name}`).not.toBeNull();
        expect(sorted(classPublicMethods(implBody!.replace(/^ {2}private [^\n]*$/gm, '')))).toEqual(
          sorted(c.methods),
        );
      }
      return;
    }
    const classBody = block(src, 'class', name);
    if (classBody) {
      // 服務類別：公開方法須與類別圖完全一致（private 方法不列入）
      const publicOnly = classBody.replace(/^ {2}(?:private|protected) [^\n]*$/gm, '');
      expect(sorted(classPublicMethods(publicOnly))).toEqual(sorted(c.methods));
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
    const file = fileForClass(name);
    const src = read(file);
    const body = block(src, 'interface', name) ?? block(src, 'class', name);
    expect(body, `${file} 找不到 ${name} 的定義`).not.toBeNull();
    for (const attr of c.attributes) {
      expect(body, `${name}.${attr} 不存在於 ${file}`).toMatch(new RegExp(`\\b${attr}\\b`));
    }
  });
});
