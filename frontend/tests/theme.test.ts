import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = fs.readFileSync(path.resolve(__dirname, '../src/styles/theme.css'), 'utf8');

/** research R12 設計 token。 */
const TOKENS: Record<string, string> = {
  '--color-cream-50': '#faf7f0',
  '--color-cream-100': '#f5f0e6',
  '--color-cream-300': '#e6dcc8',
  '--color-ink': '#2b2a28',
  '--color-primary': '#1f3a93',
  '--color-accent': '#ff6b4a',
  '--color-danger': '#b42318',
};

describe('UI 風格系統 theme.css（US6、FR-003）', () => {
  it('載入 Tailwind 並以 @theme 定義 token', () => {
    expect(css).toMatch(/@import\s+['"]tailwindcss['"]/);
    expect(css).toMatch(/@theme\s*{/);
  });

  it.each(Object.entries(TOKENS))('%s = %s', (token, value) => {
    const match = css.match(new RegExp(`${token}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
    expect(match, `${token} 未定義`).not.toBeNull();
    expect(match![1]!.toLowerCase()).toBe(value);
  });

  it('body 使用米白背景與主要文字色', () => {
    expect(css).toMatch(/background-color:\s*var\(--color-cream-50\)/);
    expect(css).toMatch(/color:\s*var\(--color-ink\)/);
  });
});
