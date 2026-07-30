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

/**
 * Tailwind 既定 indigo パレットの HEX。
 * クラス名を消しても SVG 文字列生成などで HEX 直書きが残りうるため、値でも検出する。
 */
const INDIGO_HEX = [
  '#eef2ff', // indigo-50
  '#e0e7ff', // indigo-100
  '#c7d2fe', // indigo-200
  '#a5b4fc', // indigo-300
  '#818cf8', // indigo-400
  '#6366f1', // indigo-500
  '#4f46e5', // indigo-600
  '#4338ca', // indigo-700
  '#3730a3', // indigo-800
  '#312e81', // indigo-900
  '#1e1b4b', // indigo-950
  '#4c1d95', // violet-900（旧配色で indigo と併用されていた紫）
];

/** 検査対象: src/ 配下 + PWA manifest（クローム色を持つため） */
function targetFiles(): string[] {
  return [...walk('src'), 'public/manifest.webmanifest'];
}

describe('無彩色クローム (ADR 0047)', () => {
  it('indigo のクラス名が残っていない', () => {
    const offenders: string[] = [];
    for (const file of targetFiles()) {
      const text = readFileSync(file, 'utf-8');
      text.split('\n').forEach((line, i) => {
        if (line.toLowerCase().includes('indigo')) offenders.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders, `indigo が残存:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('indigo パレットの HEX が残っていない', () => {
    const offenders: string[] = [];
    for (const file of targetFiles()) {
      const text = readFileSync(file, 'utf-8');
      text.split('\n').forEach((line, i) => {
        const lower = line.toLowerCase();
        for (const hex of INDIGO_HEX) {
          if (lower.includes(hex)) offenders.push(`${file}:${i + 1}: [${hex}] ${line.trim()}`);
        }
      });
    }
    expect(offenders, `indigo の HEX が残存:\n${offenders.join('\n')}`).toEqual([]);
  });
});
