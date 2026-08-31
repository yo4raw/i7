import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  card_counts, deck_slots, decks, rabbit_notes, shared_broach_counts,
} from '../../../db/schema';

const TABLES = [card_counts, shared_broach_counts, rabbit_notes, decks, deck_slots];

describe('db/schema', () => {
  it('テーブル名が snake_case で固定されている', () => {
    expect(TABLES.map((t) => getTableConfig(t).name)).toEqual([
      'card_counts', 'shared_broach_counts', 'rabbit_notes', 'decks', 'deck_slots',
    ]);
  });

  it('TS のプロパティ名と列名が一致している (PostgREST のレスポンスと型を揃えるため)', () => {
    for (const table of TABLES) {
      for (const column of getTableConfig(table).columns) {
        expect(column.name).toBe(column.name.toLowerCase());
        expect(column.name).not.toMatch(/[A-Z]/);
      }
    }
  });

  // getTableConfig().policies が使えない drizzle-orm バージョンだった場合、
  // このアサーションは削除してよい。ポリシー数の本来の担保は Step 6 の
  // 生成 SQL 検査 (CREATE POLICY が 20 件) 側にある。
  it('全テーブルに RLS ポリシーが 4 本ある', () => {
    for (const table of TABLES) {
      const { policies } = getTableConfig(table);
      expect(policies.map((p) => p.name).toSorted()).toHaveLength(4);
    }
  });

  it('同期対象の 4 テーブルが rev 列を持つ (deck_slots は親デッキの rev を使うので持たない)', () => {
    for (const table of [card_counts, shared_broach_counts, rabbit_notes, decks]) {
      expect(getTableConfig(table).columns.map((c) => c.name)).toContain('rev');
    }
    expect(getTableConfig(deck_slots).columns.map((c) => c.name)).not.toContain('rev');
  });
});
