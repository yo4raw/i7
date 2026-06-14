# 楽曲詳細ページのノーツ内訳表示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 楽曲詳細ページに「ノーツ内訳」セクションを追加し、各ステージ（ライト点灯段階）の倍率と属性別ノーツ数を表で表示する。

**Architecture:** 表示用の集計ロジックを純粋関数 `buildNoteBreakdown(song)` に切り出し（新規 `src/lib/songNoteBreakdown.ts`）、`songs/[id].astro` がそれを呼んでビルド時に静的テーブルを描画する。倍率は既存 `LIGHT_MULTIPLIER`、ステージ順は既存 `SONG_NOTE_GROUP_KEYS` を再利用。クライアント JS は追加しない。

**Tech Stack:** Astro 6（静的 `.astro`）/ TypeScript / Tailwind CSS v4 / Vitest（単体テスト）

---

## File Structure

- `src/lib/songNoteBreakdown.ts`（新規）— ステージ日本語ラベル `STAGE_LABELS` と純粋関数 `buildNoteBreakdown(song)`。表示ロジックの単一責務。
- `tests/unit/songNoteBreakdown.test.ts`（新規）— `buildNoteBreakdown` の単体テスト。
- `src/pages/songs/[id].astro`（修正）— 「属性比率」セクションの下に「ノーツ内訳」テーブルを追加。
- `docs/adr/0009-song-note-breakdown.md`（新規）+ `docs/adr/README.md`（修正）— 意思決定記録。

再利用（変更しない）:
- `LIGHT_MULTIPLIER`（`src/lib/score/constants.ts`）— ステージ倍率。
- `SONG_NOTE_GROUP_KEYS`（`src/lib/data/fetchSongsJson.ts`）— ステージキーの順序。
- `ATTRS` / `ATTR_BADGE_BG`（`src/lib/constants.ts`）— 属性キーと属性色。
- `Song` / `SongNoteGroup` 型（`src/lib/data/fetchSongsJson.ts`）。

---

## Task 1: `songNoteBreakdown.ts` を TDD で作る

**Files:**
- Create: `src/lib/songNoteBreakdown.ts`
- Test: `tests/unit/songNoteBreakdown.test.ts`

`SongNoteGroup` の各キーは `shout_white` / `shout_color` / `beat_white` / `beat_color` / `melody_white` / `melody_color`（整数のノーツ数）。各属性セル = white + color。倍率は `LIGHT_MULTIPLIER[key]`。全属性 0 のステージ行は除外する。

- [ ] **Step 1: 失敗する単体テストを書く**

`tests/unit/songNoteBreakdown.test.ts` を作成:

```typescript
import { describe, it, expect } from 'vitest';
import { buildNoteBreakdown, STAGE_LABELS } from '../../src/lib/songNoteBreakdown';
import type { Song } from '../../src/lib/data/fetchSongsJson';

// 必要なノートグループだけ持つ最小の Song を作る（他フィールドは型を満たすダミー）
function makeSong(groups: Partial<Record<string, Partial<Record<string, number>>>>): Song {
  const empty = {
    shout_white: 0, shout_color: 0,
    beat_white: 0, beat_color: 0,
    melody_white: 0, melody_color: 0,
  };
  const allKeys = [
    'notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6',
  ];
  const song: Record<string, unknown> = {
    id: 1, category: 'IDOLiSH7', artist: 'IDOLiSH7', song_name: 'TEST',
    song_type: null, difficulty: null, stars: null,
    shout_ratio: null, beat_ratio: null, melody_ratio: null,
    notes_count: null, duration: null,
    total_shout_white: null, total_shout_color: null,
    total_beat_white: null, total_beat_color: null,
    total_melody_white: null, total_melody_color: null,
    updated_at: null,
  };
  for (const k of allKeys) {
    song[k] = { ...empty, ...(groups[k] ?? {}) };
  }
  return song as unknown as Song;
}

describe('buildNoteBreakdown', () => {
  it('始点(white)と終点(color)を合算して属性別ノーツ数を出す', () => {
    const song = makeSong({
      light_3: { shout_white: 20, shout_color: 6, melody_white: 32, melody_color: 3 },
    });
    const bd = buildNoteBreakdown(song);
    const row = bd.rows.find(r => r.key === 'light_3')!;
    expect(row.shout).toBe(26);   // 20 + 6
    expect(row.beat).toBe(0);
    expect(row.melody).toBe(35);  // 32 + 3
    expect(row.multiplier).toBe(1.1);
    expect(row.label).toBe(STAGE_LABELS.light_3);
  });

  it('全属性0のステージ行は除外する', () => {
    const song = makeSong({
      light_3: { shout_white: 10 },
      // notes_20 などは全0
    });
    const bd = buildNoteBreakdown(song);
    expect(bd.rows.map(r => r.key)).toEqual(['light_3']);
  });

  it('属性別の合計を全ステージ合算で返す', () => {
    const song = makeSong({
      light_3: { shout_white: 10, beat_color: 4 },
      chorus_light_6: { shout_color: 5, melody_white: 7 },
    });
    const bd = buildNoteBreakdown(song);
    expect(bd.totals.shout).toBe(15);   // 10 + 5
    expect(bd.totals.beat).toBe(4);
    expect(bd.totals.melody).toBe(7);
  });

  it('ステージ順は notes_20 → … → chorus_light_6 を保つ', () => {
    const song = makeSong({
      chorus_light_6: { shout_white: 1 },
      notes_20: { beat_white: 1 },
      light_5: { melody_white: 1 },
    });
    const bd = buildNoteBreakdown(song);
    expect(bd.rows.map(r => r.key)).toEqual(['notes_20', 'light_5', 'chorus_light_6']);
  });

  it('ノーツが全くなければ hasNotes は false', () => {
    const bd = buildNoteBreakdown(makeSong({}));
    expect(bd.hasNotes).toBe(false);
    expect(bd.rows).toEqual([]);
    expect(bd.totals).toEqual({ shout: 0, beat: 0, melody: 0 });
  });

  it('STAGE_LABELS は 8 ステージすべてに日本語ラベルを持つ', () => {
    for (const k of ['notes_20','light_2','light_3','light_4','light_5','light_6','chorus_light_5','chorus_light_6']) {
      expect(typeof STAGE_LABELS[k]).toBe('string');
      expect(STAGE_LABELS[k].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:unit -- songNoteBreakdown`
Expected: FAIL（`src/lib/songNoteBreakdown` が存在しない／import エラー）

- [ ] **Step 3: 最小実装を書く**

`src/lib/songNoteBreakdown.ts` を作成:

```typescript
import type { Song, SongNoteGroup } from './data/fetchSongsJson';
import { SONG_NOTE_GROUP_KEYS } from './data/fetchSongsJson';
import { LIGHT_MULTIPLIER } from './score/constants';
import { ATTRS } from './constants';

/** ステージキー → ユーザー可視の日本語ラベル（ライト点灯状態） */
export const STAGE_LABELS: Record<string, string> = {
  notes_20: '点灯前(約20ノーツ)',
  light_2: 'ライト2つ',
  light_3: 'ライト3つ',
  light_4: 'ライト4つ',
  light_5: 'ライト5つ',
  light_6: 'ライト6つ',
  chorus_light_5: 'サビ(ライト5)',
  chorus_light_6: 'サビ(ライト6)',
};

export interface NoteBreakdownRow {
  key: string;
  label: string;
  multiplier: number;
  shout: number;
  beat: number;
  melody: number;
}

export interface NoteBreakdown {
  rows: NoteBreakdownRow[];
  totals: { shout: number; beat: number; melody: number };
  hasNotes: boolean;
}

/**
 * 楽曲の 8 ステージ × 属性 × 始点終点のノーツ数を、ステージ別・属性別の表示用データに集計する。
 * 始点(white)と終点(color)は合算する。全属性 0 のステージ行は除外する。倍率は LIGHT_MULTIPLIER を再利用。
 */
export function buildNoteBreakdown(song: Song): NoteBreakdown {
  const rows: NoteBreakdownRow[] = [];
  const totals = { shout: 0, beat: 0, melody: 0 };

  for (const key of SONG_NOTE_GROUP_KEYS) {
    const group = song[key] as SongNoteGroup | undefined;
    if (!group) continue;

    const cell = (attrKey: string): number =>
      (group[`${attrKey}_white` as keyof SongNoteGroup] ?? 0) +
      (group[`${attrKey}_color` as keyof SongNoteGroup] ?? 0);

    const shout = cell('shout');
    const beat = cell('beat');
    const melody = cell('melody');

    totals.shout += shout;
    totals.beat += beat;
    totals.melody += melody;

    if (shout + beat + melody === 0) continue;

    rows.push({
      key,
      label: STAGE_LABELS[key] ?? key,
      multiplier: LIGHT_MULTIPLIER[key] ?? 1,
      shout,
      beat,
      melody,
    });
  }

  return { rows, totals, hasNotes: rows.length > 0 };
}
```

注: `ATTRS` の import は属性キー（`shout`/`beat`/`melody`）の出典明示のために残してよいが、上記実装では文字列直書きで足りる。未使用 import で lint/astro check が警告する場合は import を削除すること。

- [ ] **Step 4: テストを実行して通ることを確認**

Run: `npm run test:unit -- songNoteBreakdown`
Expected: PASS（全6ケース）

- [ ] **Step 5: コミット**

```bash
git add src/lib/songNoteBreakdown.ts tests/unit/songNoteBreakdown.test.ts
git commit -m "feat: ノーツ内訳の集計ロジック buildNoteBreakdown を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `songs/[id].astro` にノーツ内訳セクションを追加

**Files:**
- Modify: `src/pages/songs/[id].astro`

「属性比率」セクション（`{totalRatio > 0 && (...) }` ブロック）の直後、`</BaseLayout>` の前にノーツ内訳セクションを追加する。

- [ ] **Step 1: import と集計呼び出しを追加**

frontmatter（`---` 内）冒頭の import 群に追加:

```astro
import { buildNoteBreakdown } from '../../lib/songNoteBreakdown';
```

frontmatter 末尾（`infoRows` 定義の後あたり、`---` の直前）に追加:

```astro
// ノーツ内訳（ステージ別・属性別。始点終点合算）
const noteBreakdown = buildNoteBreakdown(song);
const attrCols = [
  { name: 'Shout', key: 'shout' as const },
  { name: 'Beat', key: 'beat' as const },
  { name: 'Melody', key: 'melody' as const },
];
```

- [ ] **Step 2: テーブルセクションのマークアップを追加**

「属性比率」セクションの閉じ `)}` の後、`</BaseLayout>` の前に挿入:

```astro
  <!-- ノーツ内訳 -->
  {noteBreakdown.hasNotes && (
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
      <h2 class="text-lg font-semibold mb-4">ノーツ内訳</h2>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left border-b border-gray-200 dark:border-slate-700">
              <th class="py-2 pr-4 font-medium text-gray-500 dark:text-slate-400">ステージ</th>
              <th class="py-2 pr-4 font-medium text-gray-500 dark:text-slate-400">倍率</th>
              {attrCols.map(col => (
                <th class="py-2 px-2 font-medium text-right">
                  <span class="inline-flex items-center gap-1 justify-end">
                    <span class={`w-2.5 h-2.5 rounded-full inline-block ${ATTR_BADGE_BG[col.name]}`}></span>
                    {col.name}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100 dark:divide-slate-800">
            {noteBreakdown.rows.map(row => (
              <tr>
                <td class="py-2 pr-4">{row.label}</td>
                <td class="py-2 pr-4 tabular-nums text-gray-500 dark:text-slate-400">×{row.multiplier.toFixed(1)}</td>
                <td class="py-2 px-2 text-right tabular-nums">{row.shout.toLocaleString()}</td>
                <td class="py-2 px-2 text-right tabular-nums">{row.beat.toLocaleString()}</td>
                <td class="py-2 px-2 text-right tabular-nums">{row.melody.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr class="border-t-2 border-gray-200 dark:border-slate-700 font-semibold">
              <td class="py-2 pr-4">合計</td>
              <td class="py-2 pr-4"></td>
              <td class="py-2 px-2 text-right tabular-nums">{noteBreakdown.totals.shout.toLocaleString()}</td>
              <td class="py-2 px-2 text-right tabular-nums">{noteBreakdown.totals.beat.toLocaleString()}</td>
              <td class="py-2 px-2 text-right tabular-nums">{noteBreakdown.totals.melody.toLocaleString()}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )}
```

注: `ATTR_BADGE_BG` は既に同ファイルで import 済み（`import { ATTR_BADGE_BG } from '../../lib/constants';`）。重複 import しないこと。

- [ ] **Step 3: 型チェック**

Run: `npm run typecheck`
Expected: 0 errors（既存の警告のみ）

- [ ] **Step 4: コミット**

```bash
git add src/pages/songs/[id].astro
git commit -m "feat: 楽曲詳細にノーツ内訳テーブルを追加（属性・倍率表示）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: ADR 0009 を追加

**Files:**
- Create: `docs/adr/0009-song-note-breakdown.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: ADR 本文を作成**

`docs/adr/0009-song-note-breakdown.md`:

```markdown
# 0009. 楽曲詳細ページにノーツ内訳を表示する

- ステータス: 承認
- 日付: 2026-06-14

## 背景

楽曲詳細ページには属性比率の円グラフはあったが、ノーツがどのステージ（ライト点灯段階）にどの属性で分布するかは分からなかった。ユーザーはノーツ情報を属性と倍率が分かる形で見たかった。

## 決定

楽曲詳細ページに「ノーツ内訳」テーブルを追加する。

- 行 = 8 ステージ（点灯前〜サビ）。列 = 倍率 + 属性別（Shout/Beat/Melody）ノーツ数 + 合計行。
- 始点(white ×0.025)と終点(color ×0.030)は**合算**して属性別ノーツ数として表示する。ユーザーが求めた次元は「属性」と「倍率」のため、始点終点は分けない。
- 倍率は既存の `LIGHT_MULTIPLIER`（`src/lib/score/constants.ts`）を**再利用**し、表示用に再定義しない。
- 全属性 0 のステージ行は**除外**する（空ステージを持つ楽曲があるため）。
- 集計ロジックは純粋関数 `buildNoteBreakdown`（`src/lib/songNoteBreakdown.ts`）に切り出し単体テストで担保。ページはビルド時に静的描画（クライアント JS なし）。

## 検討した代替案

- **始点/終点も列に分ける（5 次元）**: 情報量は多いが表が密になり、ユーザー要望（属性・倍率）を超える。始点終点は合算とした。
- **属性比率の円グラフに統合**: 円グラフは全体比率専用で、ステージ×倍率の軸を表現できないため別テーブルとした。

## 影響

- 追加 `src/lib/songNoteBreakdown.ts` + 単体テスト、`songs/[id].astro` にセクション追加。
- 楽曲詳細を含むページ E2E は `playwright.config.ts` で無効化中のため、本機能の検証は単体テスト + dev サーバー目視で行った。
```

- [ ] **Step 2: README.md の一覧表に追記**

`docs/adr/README.md` の `0008` 行の下に追加:

```markdown
| [0009](0009-song-note-breakdown.md) | 楽曲詳細ページにノーツ内訳を表示する | 承認 |
```

- [ ] **Step 3: コミット**

```bash
git add docs/adr/0009-song-note-breakdown.md docs/adr/README.md
git commit -m "docs: ADR 0009 楽曲詳細のノーツ内訳表示を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: PR 作成（リリースは制御側で実施）

**Files:** なし（コミットは Task 1-3 で完了済み）

リリースノートは git タグ間のコミットから自動生成されるため手動編集は不要（`feat:` コミットがそのまま反映される）。

- [ ] **Step 1: 制御側（コントローラ）が dev サーバーで目視確認する**

`npm run dev` を起動済みの状態で、ノーツのある楽曲詳細ページを開き、ノーツ内訳テーブル（ステージ・倍率・属性列・合計行）が表示されることをスクショで確認し `tmp/` に保存する。

- [ ] **Step 2: push して PR を作成**

```bash
git push -u origin feature/song-note-breakdown
gh pr create --title "feat: 楽曲詳細ページにノーツ内訳を追加 (ADR 0009)" --body "$(cat <<'EOF'
## 概要
楽曲詳細ページに「ノーツ内訳」テーブルを追加。ステージ（ライト点灯段階）ごとの倍率と属性別ノーツ数（始点終点合算）、属性別合計を表示する。

## 変更点
- `src/lib/songNoteBreakdown.ts`（新規）: 集計純粋関数 `buildNoteBreakdown` + ステージ日本語ラベル
- `tests/unit/songNoteBreakdown.test.ts`（新規）: 集計の単体テスト
- `songs/[id].astro`: ノーツ内訳セクション追加（ビルド時静的描画）
- ADR 0009 追加

## 設計
- spec: `docs/superpowers/specs/2026-06-14-song-note-breakdown-design.md`
- plan: `docs/superpowers/plans/2026-06-14-song-note-breakdown.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage**: 集計ロジック（合算・ゼロ行除外・合計・倍率・hasNotes）=Task 1、テーブル描画=Task 2、ADR=Task 3、PR/リリース=Task 4。E2E は spec どおり追加せず単体+目視。全項目に対応あり。
- **型整合**: `buildNoteBreakdown` の返却型 `NoteBreakdown { rows: NoteBreakdownRow[]; totals; hasNotes }` を Task 1 で定義し、Task 2 で `noteBreakdown.hasNotes` / `.rows` / `.totals.shout` 等を参照。`NoteBreakdownRow` のプロパティ名 `key/label/multiplier/shout/beat/melody` は Task 2 のテンプレートと一致。
- **再利用整合**: `LIGHT_MULTIPLIER` のキーと `SONG_NOTE_GROUP_KEYS` は同一 8 キー（`docs/score_calc_spec.md` §2-2）。`ATTR_BADGE_BG` のキーは属性名（`Shout`/`Beat`/`Melody`）で Task 2 の `col.name` と一致。
- **プレースホルダ**: なし。
