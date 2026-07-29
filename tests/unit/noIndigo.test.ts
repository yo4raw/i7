import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** src/ 配下の対象拡張子ファイルを再帰的に列挙する */
function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.(svelte|astro|ts|css)$/.test(entry)) acc.push(full);
  }
  return acc;
}

describe('無彩色クローム (ADR 0047)', () => {
  it('src/ に indigo が残っていない', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const text = readFileSync(file, 'utf-8');
      text.split('\n').forEach((line, i) => {
        if (line.includes('indigo')) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `indigo が残存:\n${offenders.join('\n')}`).toEqual([]);
  });
});
