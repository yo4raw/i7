# 共通ブローチ スコア寄与 TOP10 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 楽曲詳細ページに「共通ブローチ スコア寄与 TOP10」セクションを追加し、各ブローチの楽曲別スコア寄与を水平棒グラフで表示する。

**Architecture:** 寄与計算を純粋関数 `buildBroachRanking(song)`（新規 `src/lib/score/songBroachRanking.ts`）に切り出す。寄与は実エンジンの `calcNoteScore`（`simulation.ts`、export 追加）を再利用し、ステージ×属性×始点終点のカウント×1ノーツ得点で集計。`songs/[id].astro` が結果を CSS 幅バーで静的描画する（クライアント JS なし）。

**Tech Stack:** TypeScript / Astro 6（静的）/ Tailwind CSS v4 / Vitest

---

## File Structure

- `src/lib/score/simulation.ts`（修正）— `calcNoteScore` に `export` を付与（挙動変更なし）。
- `src/lib/score/songBroachRanking.ts`（新規）— `buildBroachRanking(song)` と型。寄与集計の単一責務。
- `tests/unit/score/songBroachRanking.test.ts`（新規）— 単体テスト。
- `src/pages/songs/[id].astro`（修正）— ランキングセクション（CSS バーチャート）追加。
- `docs/adr/0010-song-broach-score-ranking.md`（新規）+ `docs/adr/README.md`（修正）。

再利用（変更しない）:
- `SHARED_BROACHS`（`src/lib/data/sharedBroachs.ts`）。
- `SONG_NOTE_GROUP_KEYS` / `Song` / `SongNoteGroup`（`src/lib/data/fetchSongsJson.ts`）。
- `NOTE_RATE` / `LIGHT_MULTIPLIER`（`src/lib/score/constants.ts`）。

---

## Task 1: `calcNoteScore` を export し、`buildBroachRanking` を TDD で作る

**Files:**
- Modify: `src/lib/score/simulation.ts`
- Create: `src/lib/score/songBroachRanking.ts`
- Test: `tests/unit/score/songBroachRanking.test.ts`

### 背景の事実（実装前に確認すること）
- `simulation.ts` の現在の定義（先頭付近）:
  ```ts
  function calcNoteScore(appeal: number, note: FlatNote): number {
    const perNoteBase = Math.floor(appeal * NOTE_RATE[note.type]);
    return Math.floor(perNoteBase * LIGHT_MULTIPLIER[note.group]);
  }
  ```
  `note.attribute` は未使用（`note.type` と `note.group` のみ参照）。
- `FlatNote`（`src/lib/score/types.ts`）= `{ attribute: AttributeName; type: 'white'|'color'; group: string; excluded: boolean }`。
- `SongNoteGroup` のキー = `shout_white, shout_color, beat_white, beat_color, melody_white, melody_color`（整数）。
- `SharedBroach` = `{ id, name, shout, beat, melody, targetAttribute? }`。`targetAttribute` を持つのは id 24-26。

- [ ] **Step 1: 失敗する単体テストを書く**

`tests/unit/score/songBroachRanking.test.ts` を作成:

```typescript
import { describe, it, expect } from 'vitest';
import { buildBroachRanking } from '../../../src/lib/score/songBroachRanking';
import type { Song } from '../../../src/lib/data/fetchSongsJson';

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
  for (const k of allKeys) song[k] = { ...empty, ...(groups[k] ?? {}) };
  return song as unknown as Song;
}

describe('buildBroachRanking', () => {
  it('最大10件・score降順で返す', () => {
    const song = makeSong({ light_6: { shout_white: 50, beat_white: 50, melody_white: 50 } });
    const ranking = buildBroachRanking(song);
    expect(ranking.length).toBeLessThanOrEqual(10);
    expect(ranking.length).toBeGreaterThan(0);
    for (let i = 1; i < ranking.length; i++) {
      expect(ranking[i - 1].score).toBeGreaterThanOrEqual(ranking[i].score);
    }
  });

  it('targetAttribute を持つ id 24-26 を含まない', () => {
    const song = makeSong({ light_6: { shout_white: 100, beat_white: 100, melody_white: 100 } });
    const ranking = buildBroachRanking(song);
    expect(ranking.some(e => e.id >= 24 && e.id <= 26)).toBe(false);
  });

  it('Shout偏重曲では Shout系ブローチが Melody系より上位', () => {
    const song = makeSong({ light_6: { shout_white: 200, melody_white: 1 } });
    const ranking = buildBroachRanking(song);
    const shout1100 = ranking.findIndex(e => e.name === 'Shout1100');
    const melody1100 = ranking.findIndex(e => e.name === 'Melody1100');
    expect(shout1100).toBeGreaterThanOrEqual(0);
    // Shout1100 はランクイン、Melody1100 はランク外か下位
    expect(shout1100 < melody1100 || melody1100 === -1).toBe(true);
  });

  it('単一属性ブローチは attribute にその属性、ALL系は All', () => {
    const song = makeSong({ light_6: { shout_white: 100, beat_white: 100, melody_white: 100 } });
    const ranking = buildBroachRanking(song);
    const shout = ranking.find(e => e.name === 'Shout1100');
    const all = ranking.find(e => e.name === 'ALL750');
    expect(shout?.attribute).toBe('Shout');
    expect(all?.attribute).toBe('All');
  });

  it('ノーツが無ければ空配列', () => {
    expect(buildBroachRanking(makeSong({}))).toEqual([]);
  });

  it('寄与は実エンジン式（2段floor）と一致する', () => {
    // light_6 (×1.5) に shout_white 10 のみ。ALL700 の shout=700。
    // perNote = floor(700 * 0.025) = 17 → floor(17 * 1.5) = 25。10ノーツ → 250。
    const song = makeSong({ light_6: { shout_white: 10 } });
    const ranking = buildBroachRanking(song);
    const all700 = ranking.find(e => e.name === 'ALL700');
    expect(all700?.score).toBe(250);
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:unit -- songBroachRanking`
Expected: FAIL（`songBroachRanking` が存在しない）

- [ ] **Step 3: `calcNoteScore` を export**

`src/lib/score/simulation.ts` の
```ts
function calcNoteScore(appeal: number, note: FlatNote): number {
```
を
```ts
export function calcNoteScore(appeal: number, note: FlatNote): number {
```
に変更する（本体は変えない）。

- [ ] **Step 4: `songBroachRanking.ts` を実装**

`src/lib/score/songBroachRanking.ts` を作成:

```typescript
import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import { SONG_NOTE_GROUP_KEYS } from '../data/fetchSongsJson';
import { SHARED_BROACHS } from '../data/sharedBroachs';
import type { AttributeName } from './types';
import { calcNoteScore } from './simulation';

export type BroachAttrTag = AttributeName | 'All';

export interface BroachRankingEntry {
  id: number;
  name: string;
  score: number;
  /** バー色分け用。単一属性ブローチはその属性、複数属性は 'All' */
  attribute: BroachAttrTag;
}

const ATTR_FIELDS: { name: AttributeName; field: 'shout' | 'beat' | 'melody' }[] = [
  { name: 'Shout', field: 'shout' },
  { name: 'Beat', field: 'beat' },
  { name: 'Melody', field: 'melody' },
];
const TYPES: ('white' | 'color')[] = ['white', 'color'];
const TOP_N = 10;

function broachTag(shout: number, beat: number, melody: number): BroachAttrTag {
  const nonZero = ATTR_FIELDS.filter(a => ({ shout, beat, melody })[a.field] > 0);
  return nonZero.length === 1 ? nonZero[0].name : 'All';
}

/**
 * 楽曲ごとの共通ブローチ単独スコア寄与を計算し、寄与降順の上位 TOP_N を返す。
 * 寄与 = Σ_(group,attr,type) count(group,attr,type) × calcNoteScore(broach[attr], {type, group})。
 * デッキ枚数でスケールする targetAttribute 付きブローチ（id 24-26）は対象外。
 */
export function buildBroachRanking(song: Song): BroachRankingEntry[] {
  const entries: BroachRankingEntry[] = [];

  for (const broach of SHARED_BROACHS) {
    if (broach.targetAttribute) continue; // デッキ依存のため除外

    let score = 0;
    for (const groupKey of SONG_NOTE_GROUP_KEYS) {
      const group = song[groupKey] as SongNoteGroup | undefined;
      if (!group) continue;
      for (const attr of ATTR_FIELDS) {
        const appeal = broach[attr.field];
        if (!appeal) continue;
        for (const type of TYPES) {
          const count = (group[`${attr.field}_${type}` as keyof SongNoteGroup] as number) ?? 0;
          if (!count) continue;
          score += count * calcNoteScore(appeal, {
            attribute: attr.name,
            type,
            group: groupKey,
            excluded: false,
          });
        }
      }
    }

    if (score > 0) {
      entries.push({
        id: broach.id,
        name: broach.name,
        score,
        attribute: broachTag(broach.shout, broach.beat, broach.melody),
      });
    }
  }

  entries.sort((a, b) => b.score - a.score);
  return entries.slice(0, TOP_N);
}
```

- [ ] **Step 5: テストを実行して通ることを確認**

Run: `npm run test:unit -- songBroachRanking`
Expected: PASS（全6ケース）

- [ ] **Step 6: 既存テストの回帰確認 + typecheck**

Run: `npm run test:unit`
Expected: 全テスト緑（`calcNoteScore` の export 追加で既存挙動は不変）。

Run: `npm run typecheck`
Expected: 0 errors。

- [ ] **Step 7: コミット**

```bash
git add src/lib/score/simulation.ts src/lib/score/songBroachRanking.ts tests/unit/score/songBroachRanking.test.ts
git commit -m "feat: 共通ブローチ スコア寄与ランキングの算出ロジックを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: `songs/[id].astro` にランキングセクション（CSS バーチャート）を追加

**Files:**
- Modify: `src/pages/songs/[id].astro`

「ノーツ内訳」セクション（`{noteBreakdown.hasNotes && (...) }`）の直後、`</BaseLayout>` の前に追加する。

- [ ] **Step 1: import と算出を追加**

frontmatter の import 群に追加:
```astro
import { buildBroachRanking } from '../../lib/score/songBroachRanking';
```

frontmatter 末尾（`attrCols` の後あたり）に追加:
```astro
// 共通ブローチ スコア寄与 TOP10
const broachRanking = buildBroachRanking(song);
const broachMaxScore = broachRanking.length > 0 ? broachRanking[0].score : 0;
const BROACH_BAR_BG: Record<string, string> = {
  Shout: 'bg-red-500',
  Beat: 'bg-green-500',
  Melody: 'bg-blue-500',
  All: 'bg-indigo-500',
};
```

- [ ] **Step 2: セクションのマークアップを追加**

「ノーツ内訳」セクションの閉じ `)}` の後、`</BaseLayout>` の前に挿入:

```astro
  <!-- 共通ブローチ スコア寄与 TOP10 -->
  {broachRanking.length > 0 && (
    <section class="bg-white dark:bg-slate-800 rounded-lg shadow p-6 mb-6">
      <h2 class="text-lg font-semibold mb-1">共通ブローチ スコア寄与 TOP10</h2>
      <p class="text-xs text-gray-500 dark:text-slate-400 mb-4">この楽曲のノーツ分布における各共通ブローチ単独のスコア寄与（デッキ非依存の目安）。</p>
      <ol class="space-y-2">
        {broachRanking.map((entry, i) => (
          <li class="flex items-center gap-2 text-sm">
            <span class="w-5 text-right tabular-nums text-gray-400 dark:text-slate-500 flex-shrink-0">{i + 1}</span>
            <span class="w-32 sm:w-40 truncate flex-shrink-0" title={entry.name}>{entry.name}</span>
            <div class="flex-1 bg-gray-100 dark:bg-slate-700 rounded h-4 overflow-hidden">
              <div
                class={`h-full rounded ${BROACH_BAR_BG[entry.attribute] || 'bg-indigo-500'}`}
                style={`width: ${broachMaxScore > 0 ? (entry.score / broachMaxScore) * 100 : 0}%`}
              ></div>
            </div>
            <span class="w-16 text-right tabular-nums font-medium flex-shrink-0">{entry.score.toLocaleString()}</span>
          </li>
        ))}
      </ol>
    </section>
  )}
```

実ファイルの「ノーツ内訳」セクションの位置を確認してから挿入すること。構造が想定と大きく異なる場合は STOP して NEEDS_CONTEXT を報告。

- [ ] **Step 3: typecheck**

Run: `npm run typecheck`
Expected: 0 errors。

- [ ] **Step 4: コミット**

```bash
git add src/pages/songs/[id].astro
git commit -m "feat: 楽曲詳細に共通ブローチ スコア寄与 TOP10 棒グラフを追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: ADR 0010 を追加

**Files:**
- Create: `docs/adr/0010-song-broach-score-ranking.md`
- Modify: `docs/adr/README.md`

- [ ] **Step 1: ADR 本文を作成**

`docs/adr/0010-song-broach-score-ranking.md`:

```markdown
# 0010. 楽曲詳細ページに共通ブローチ スコア寄与 TOP10 を表示する

- ステータス: 承認
- 日付: 2026-06-14

## 背景

どの共通ブローチが楽曲のスコアに効くかは、楽曲の属性偏重・倍率分布で変わる。楽曲詳細ページにはデッキ情報がないため、ブローチの「スコア寄与」をどう定義するかが論点だった。

## 決定

楽曲詳細ページに「共通ブローチ スコア寄与 TOP10」セクションを水平棒グラフで追加する。

- 寄与は **デッキ非依存の単独寄与**: ブローチの属性値をそのまま appeal とし、実エンジンと同一の 2 段 floor 式（`calcNoteScore`）を楽曲の全ノーツに適用して合算する。式の二重定義を避けるため `calcNoteScore` を export して再利用する。
- デッキ枚数でスケールする `targetAttribute` 付き 3 種（id 24-26）は単独寄与と直接比較できないため**ランキングから除外**し、フラット加算の 23 種を対象とする。
- 棒グラフは SVG ではなく CSS 幅バーで描画（レスポンシブ・ダークモード・アクセシブル・クライアント JS 不要）。バー色はブローチ属性（Shout/Beat/Melody/All）で塗り、スコア値を必ず併記して色のみ依存を避ける。

## 検討した代替案

- **簡易線形モデル（floor なし）**: 単純だが実スコアと乖離するため不採用。
- **参照デッキ上の限界寄与**: より実戦的だがデッキ仮定が必要で deck 非依存にできず不採用。
- **条件付き 3 種を基本値で含める**: 枚数スケールを無視すると過小評価で誤解を招くため除外を選択。

## 影響

- 追加 `src/lib/score/songBroachRanking.ts` + 単体テスト、`songs/[id].astro` にセクション追加、`simulation.ts` の `calcNoteScore` を export。
- 楽曲詳細を含むページ E2E は無効化中のため、検証は単体テスト + dev サーバー目視で行った。
```

- [ ] **Step 2: README.md に追記**

`docs/adr/README.md` の `0009` 行の下に追加:
```markdown
| [0010](0010-song-broach-score-ranking.md) | 楽曲詳細ページに共通ブローチ スコア寄与 TOP10 を表示する | 承認 |
```

- [ ] **Step 3: コミット**

```bash
git add docs/adr/0010-song-broach-score-ranking.md docs/adr/README.md
git commit -m "docs: ADR 0010 共通ブローチ スコア寄与 TOP10 を追加

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: 目視確認・PR 作成（リリースは制御側で実施）

- [ ] **Step 1: 制御側が dev サーバーで目視確認**

`npm run dev` 起動済みでノーツのある楽曲（例 `/songs/1/`）を開き、TOP10 棒グラフ（順位・名前・色付きバー・スコア値、1位が最長）が表示されることをスクショで確認し `tmp/` に保存。

- [ ] **Step 2: push して PR 作成**

```bash
git push -u origin feature/song-broach-score-ranking
gh pr create --title "feat: 楽曲詳細に共通ブローチ スコア寄与 TOP10 を追加 (ADR 0010)" --body "$(cat <<'EOF'
## 概要
楽曲詳細ページに「共通ブローチ スコア寄与 TOP10」を水平棒グラフで追加。各ブローチの属性値を appeal として実エンジン式でその楽曲の全ノーツに適用した単独寄与（デッキ非依存）でランク付けする。

## 変更点
- `src/lib/score/songBroachRanking.ts`（新規）: `buildBroachRanking(song)`（実エンジンの `calcNoteScore` を再利用）
- `src/lib/score/simulation.ts`: `calcNoteScore` を export（挙動不変）
- `tests/unit/score/songBroachRanking.test.ts`（新規）: 降順・除外・属性偏重・タグ・2段floor一致の単体テスト
- `songs/[id].astro`: CSS バーの TOP10 セクション追加
- ADR 0010 追加

## 仕様判断
- デッキ枚数でスケールする targetAttribute 付き 3 種（id 24-26）は除外
- バーは色のみ依存を避けスコア値を併記

## 確認
- `npm run test:unit`: 全緑（新規含む）
- `npm run typecheck`: 0 errors
- dev サーバー目視確認済み
- 注: 楽曲詳細ページ E2E は無効化中のため E2E は追加せず単体テストで担保

## 設計
- spec: `docs/superpowers/specs/2026-06-14-song-broach-score-ranking-design.md`
- plan: `docs/superpowers/plans/2026-06-14-song-broach-score-ranking.md`

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review

- **Spec coverage**: 寄与計算（実エンジン式・除外・タグ）=Task 1、棒グラフ描画=Task 2、ADR=Task 3、PR/リリース=Task 4。E2E は spec どおり単体+目視に置換。全項目に対応あり。
- **型整合**: `BroachRankingEntry { id, name, score, attribute }` を Task 1 で定義、Task 2 で `entry.name/.score/.attribute` と `broachRanking[0].score`、`BROACH_BAR_BG[entry.attribute]` を参照。`attribute` の取りうる値（'Shout'|'Beat'|'Melody'|'All'）と `BROACH_BAR_BG` のキーが一致。
- **再利用整合**: `calcNoteScore(appeal, note)` の `note` は `FlatNote`（attribute/type/group/excluded）。合成ノートで呼び、attribute は未使用。`SONG_NOTE_GROUP_KEYS` と `LIGHT_MULTIPLIER` のキーは一致（既存仕様）。`targetAttribute` 付きは id 24-26 のみ。
- **0除算**: `broachMaxScore === 0` はランキング空（セクション非表示）でのみ発生し、バー幅式にも `> 0` ガードあり。
- **プレースホルダ**: なし。
