# 衣装比較ページ実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** UR 衣装の単体強さをスキル種別ごとの比較軸でランキング表示する `/card-compare/` ページを新設する。

**Architecture:** 純粋計算モジュール `src/lib/score/cardStrength.ts`（デッキ非依存・1枚あたりの期待スコア計算）を既存スコアエンジンの部品（`parseSkill` / `resolveDeckBroachs` / `NOTE_RATE` / `LIGHT_MULTIPLIER`）の再利用で実装し、その上に Svelte 5 (runes) の表示コンポーネント群を載せる。データはビルド時フェッチ → props 渡し（score-calc ページと同じパターン）。グラフは SVG ではなく HTML/CSS flexbox。

**Tech Stack:** Astro 6 / Svelte 5 ($props, $state, $derived) / Tailwind CSS v4 (dark: ペア必須) / Vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-06-11-card-compare-design.md` / ADR 0007

**前提条件（spec で確定済み）:** UR 限定 / 全ノーツ Perfect 前提 / センタースキル無視 / 固有ブローチ装備込み / 曲選択式（初期 DIAMOND FUSION）/ デフォルト所持のみ（`i7_card_counts` が空なら全件）/ 特効トグル（デフォルトオフ・開催中イベントがある時のみ表示）/ 状態の localStorage 永続化はしない

**ドメイン注意:** 縮小スキルは単体でも発動する（「2枚以上で発動」は誤り）。縮小の比較は期待スコア化せず多段ソート（①効果秒数降順 → ②選択曲での最大発動回数降順 → ③確率降順 → ④属性値合計降順）。

---

## 計算モデルの要点（実装者向け背景）

- 1 ノーツのスコアは `floor(floor(属性値 × NOTE_RATE[white|color]) × LIGHT_MULTIPLIER[group])`（`simulation.ts` の `calcNoteScore` と同式）。属性・白色・グループのみで決まるため、**シャッフル（flattenNotes）不要で曲のグループ別カウントから決定的に合算できる**
- スコアアップ期待値は `floor(floor(発動機会 ÷ count) × per/100 × value)`。発動機会はタイマー系（`skill.isTimer`）なら `song.duration`、それ以外は `song.notes_count`。デッキ非依存（`calcCardSkillExpected` と同式）
- スキルパラメータの解析は `teamBuilder.ts` の `parseSkill`（スキルレベル 5 + 使用可能レベルへのフォールバック、判定補助系は null）を export して再利用する。**重複実装しない**
- 固有ブローチの条件判定は `broachResolver.ts` の `resolveDeckBroachs` を「カード1枚だけのデッキ `[card, null×5]`」で呼んで再利用する。カードに複数ブローチがある場合は **1個ずつ装備した時の (属性値由来スコア + 種類9スコアボーナス) が最大になるブローチを選ぶ**（プレイヤーが最適な1個を装備する想定）。種類7（3属性条件）は単独デッキでは発動しない（仕様通り）
- 特効はカードの素ステータスに `Math.round(stat × multiplier)`（`computeTeam` と同じ適用順: 特効倍率 → ブローチ加算）
- 所持判定は `localStorage` の `i7_card_counts`（key = `String(card.ID)`、値 > 0 で所持）

## File Structure

| ファイル | 役割 |
|---------|------|
| Modify: `src/lib/score/teamBuilder.ts:24` | `parseSkill` に `export` を付ける（1行） |
| Create: `src/lib/score/cardStrength.ts` | 1枚あたりの強さ計算（純粋関数・UI 非依存） |
| Create: `tests/unit/score/cardStrength.test.ts` | 上記の Vitest 単体テスト |
| Create: `src/components/compare/ScoreUpChart.svelte` | スコアアップタブの積み上げ棒グラフ（表示専用） |
| Create: `src/components/compare/ShrinkChart.svelte` | 判定縮小タブの多段ソートチャート（表示専用） |
| Create: `src/components/compare/CompareDetailPanel.svelte` | 詳細比較パネル（表示専用） |
| Create: `src/components/CardCompare.svelte` | ページ本体（状態管理・データ加工・タブ切替） |
| Create: `src/pages/card-compare/index.astro` | ルート（ビルド時フェッチ → props） |
| Modify: `src/components/HeaderNav.svelte:25-30` | スコア計算ドロップダウンに「衣装比較」追加 |
| Create: `tests/card-compare.test.ts` | Playwright E2E |

---

### Task 1: cardStrength 計算モジュール（TDD）

**Files:**
- Modify: `src/lib/score/teamBuilder.ts:24`
- Create: `src/lib/score/cardStrength.ts`
- Test: `tests/unit/score/cardStrength.test.ts`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/cardStrength.test.ts` を以下の内容で作成:

```ts
import { describe, it, expect } from 'vitest';

import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import type { Song } from '../../../src/lib/data/fetchSongsJson';
import {
  buildCardStrengthEntry,
  calcBaseScore,
  classifyCard,
  compareShrink,
  formatScore,
  shrinkTieKey,
} from '../../../src/lib/score/cardStrength';
import { calcExpectedScore, computeTeam, flattenNotes } from '../../../src/lib/score/engine';
import { findCardById, findSongById } from '../../fixtures';

const EMPTY_GROUP = {
  shout_white: 0, shout_color: 0, beat_white: 0, beat_color: 0, melody_white: 0, melody_color: 0,
};

/** notes_20: shout_white 10 / melody_color 20、chorus_light_6: melody_white 5 の合成曲 */
function makeSong(over: Partial<Song> = {}): Song {
  return {
    id: 999, song_name: 'テスト曲', difficulty: 'EXPERT', duration: 113, notes_count: 493,
    notes_20: { ...EMPTY_GROUP, shout_white: 10, melody_color: 20 },
    light_2: { ...EMPTY_GROUP }, light_3: { ...EMPTY_GROUP }, light_4: { ...EMPTY_GROUP },
    light_5: { ...EMPTY_GROUP }, light_6: { ...EMPTY_GROUP },
    chorus_light_5: { ...EMPTY_GROUP },
    chorus_light_6: { ...EMPTY_GROUP, melody_white: 5 },
    ...over,
  } as unknown as Song;
}

function makeCard(over: Partial<Card> = {}): Card {
  return {
    ID: 1, cardID: 9001, cardname: 'テスト衣装', name: '九条天', rarity: 'UR', attribute: 'Melody',
    shout_max: 1000, beat_max: 1000, melody_max: 4000,
    ap_skill_type: 'スコアアップ（コンボ）',
    ap_skill_5_count: 25, ap_skill_5_per: 40, ap_skill_5_value: 5200, ap_skill_5_rate: 0,
    sp_time: 0,
    ...over,
  } as unknown as Card;
}

function makeBroach(over: Partial<FixedBroach> = {}): FixedBroach {
  return {
    id: 501, card_id: 9001, broach_type: 1,
    shout: 0, beat: 0, melody: 0, score: 0,
    group: null, idol: null, attribute: null, song: null, limit: null,
    ...over,
  } as unknown as FixedBroach;
}

describe('calcBaseScore (属性値由来スコア)', () => {
  it('グループ別カウント × 1ノーツ基底値の決定的合算と一致する', () => {
    // shout_white: floor(1000*0.025)=25, ×1.0 → 25 × 10 = 250
    // melody_color: floor(4000*0.03)=120, ×1.0 → 120 × 20 = 2400
    // chorus melody_white: floor(4000*0.025)=100, ×3.0 → 300 × 5 = 1500
    const appeal = { Shout: 1000, Beat: 1000, Melody: 4000 };
    expect(calcBaseScore(appeal, makeSong())).toBe(250 + 2400 + 1500);
  });

  it('既存エンジン (calcExpectedScore) の baseScore と一致する（フィクスチャ実データ・非センター配置）', () => {
    const card = findCardById(2484);
    const song = findSongById(2);
    // slot 1 (非センター) に1枚だけ配置 → センタースキルなしのチーム属性値 = カード素値
    const team = computeTeam([null, card, null, null, null, null], [], song);
    const notes = flattenNotes(song, 42);
    const engineBase = calcExpectedScore(team, notes, song.notes_count || 0).baseScore;
    const appeal = { Shout: card.shout_max || 0, Beat: card.beat_max || 0, Melody: card.melody_max || 0 };
    expect(calcBaseScore(appeal, song)).toBe(engineBase);
  });
});

describe('buildCardStrengthEntry (スコアアップ系)', () => {
  it('コンボ型: 発動機会はノーツ数、期待値 = floor(floor(493/25) × 0.4 × 5200)', () => {
    const entry = buildCardStrengthEntry(makeCard(), [], makeSong());
    expect(entry.maxActivations).toBe(19);
    expect(entry.skillExpected).toBe(Math.floor(19 * 0.4 * 5200)); // 39520
    expect(entry.totalScore).toBe(entry.baseScore + entry.skillExpected);
  });

  it('タイマー型: 発動機会は曲秒数', () => {
    const card = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_5_count: 15, ap_skill_5_per: 50, ap_skill_5_value: 4800,
    });
    const entry = buildCardStrengthEntry(card, [], makeSong());
    expect(entry.maxActivations).toBe(7); // floor(113/15)
    expect(entry.skillExpected).toBe(16800); // floor(7 × 0.5 × 4800)
  });

  it('判定補助系 (MISS→Good) はスキル期待値 0・属性値のみ', () => {
    const entry = buildCardStrengthEntry(makeCard({ ap_skill_type: 'MISS→Good' }), [], makeSong());
    expect(entry.skill).toBeNull();
    expect(entry.skillExpected).toBe(0);
    expect(entry.totalScore).toBe(entry.baseScore);
  });

  it('特効倍率は素ステータスに round 適用される', () => {
    const plain = buildCardStrengthEntry(makeCard({ ap_skill_type: null }), [], makeSong());
    const boosted = buildCardStrengthEntry(makeCard({ ap_skill_type: null }), [], makeSong(), 2.0);
    expect(boosted.appeal.Melody).toBe(8000);
    expect(boosted.appealTotal).toBe(plain.appealTotal * 2);
  });
});

describe('固有ブローチ', () => {
  it('種類1 (無条件属性アップ) は単独デッキで有効', () => {
    const broach = makeBroach({ melody: 4500 });
    const entry = buildCardStrengthEntry(makeCard(), [broach], makeSong());
    expect(entry.appeal.Melody).toBe(8500);
  });

  it('種類7 (3属性条件) は単独デッキでは発動しない', () => {
    const broach = makeBroach({ broach_type: 7, melody: 9000, limit: 2 });
    const entry = buildCardStrengthEntry(makeCard(), [broach], makeSong());
    expect(entry.appeal.Melody).toBe(4000);
  });

  it('複数ブローチからスコアが最大になる1個を選ぶ (Melody 偏重曲では melody ブローチ)', () => {
    const shoutBr = makeBroach({ id: 501, shout: 5000 });
    const melodyBr = makeBroach({ id: 502, melody: 4500 });
    const entry = buildCardStrengthEntry(makeCard(), [shoutBr, melodyBr], makeSong());
    expect(entry.appeal.Melody).toBe(8500);
    expect(entry.appeal.Shout).toBe(1000);
  });
});

describe('判定縮小系', () => {
  const shrinkCard = (over: Partial<Card> = {}) => makeCard({
    ap_skill_type: '判定縮小（コンボ）',
    ap_skill_5_count: 30, ap_skill_5_per: 40, ap_skill_5_value: 8, ap_skill_5_rate: 1.5,
    ...over,
  });

  it('classifyCard が shrink を判別する', () => {
    expect(classifyCard(shrinkCard())).toBe('shrink');
    expect(classifyCard(makeCard())).toBe('scoreUp');
    expect(classifyCard(makeCard({ ap_skill_type: null }))).toBe('scoreUp');
  });

  it('縮小はスキル期待値 0・最大発動回数のみ算出', () => {
    const entry = buildCardStrengthEntry(shrinkCard(), [], makeSong());
    expect(entry.skillExpected).toBe(0);
    expect(entry.maxActivations).toBe(16); // floor(493/30)
  });

  it('compareShrink: 秒数 → 最大発動回数 → 確率 → 属性値合計の辞書式', () => {
    const song = makeSong();
    const e9sec = buildCardStrengthEntry(shrinkCard({ ap_skill_5_value: 9 }), [], song);
    const e8sec = buildCardStrengthEntry(shrinkCard({ ap_skill_5_value: 8 }), [], song);
    expect(compareShrink(e9sec, e8sec)).toBeLessThan(0); // 9秒が先

    const eCombo25 = buildCardStrengthEntry(shrinkCard({ ap_skill_5_count: 25 }), [], song);
    expect(compareShrink(eCombo25, e8sec)).toBeLessThan(0); // 同秒数 → 発動回数 19 > 16

    const ePer50 = buildCardStrengthEntry(shrinkCard({ ap_skill_5_per: 50 }), [], song);
    expect(compareShrink(ePer50, e8sec)).toBeLessThan(0); // 同秒数・同回数 → 確率 50 > 40

    const eHighAppeal = buildCardStrengthEntry(shrinkCard({ melody_max: 5000 }), [], song);
    expect(compareShrink(eHighAppeal, e8sec)).toBeLessThan(0); // 全同 → 属性値合計
  });

  it('shrinkTieKey: 秒数・発動回数・確率が同じなら同率', () => {
    const song = makeSong();
    const a = buildCardStrengthEntry(shrinkCard(), [], song);
    const b = buildCardStrengthEntry(shrinkCard({ melody_max: 5000 }), [], song);
    const c = buildCardStrengthEntry(shrinkCard({ ap_skill_5_per: 50 }), [], song);
    expect(shrinkTieKey(a)).toBe(shrinkTieKey(b)); // 属性値違いは同率
    expect(shrinkTieKey(a)).not.toBe(shrinkTieKey(c));
  });
});

describe('formatScore', () => {
  it('1万以上は万表記、未満はカンマ区切り', () => {
    expect(formatScore(152340)).toBe('15.2万');
    expect(formatScore(9999)).toBe('9,999');
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npm run test:unit -- cardStrength`
Expected: FAIL（`cardStrength.ts` が存在しないため import エラー）

- [ ] **Step 3: parseSkill を export する**

`src/lib/score/teamBuilder.ts:24` の `function parseSkill(` を `export function parseSkill(` に変更（それ以外は触らない）。

- [ ] **Step 4: cardStrength.ts を実装する**

`src/lib/score/cardStrength.ts` を以下の内容で作成:

```ts
/**
 * 衣装比較ページ用: 1枚あたりの強さ指標計算（デッキ非依存の純粋関数）。
 *
 * 前提条件 (docs/adr/0007 / docs/superpowers/specs/2026-06-11-card-compare-design.md):
 * - UR 限定 / 全ノーツ Perfect 前提 / センタースキル無視 / 固有ブローチ装備込み
 * - スコアアップ系: 期待スコア = 属性値由来スコア + スキル期待値
 * - 判定縮小系: 期待スコア化せず多段ソート（秒数 → 最大発動回数 → 確率 → 属性値合計）
 */
import type { Card } from '../data/fetchCardsJson';
import { SKILL_TYPE } from '../data/fetchCardsJson';
import type { FixedBroach } from '../data/fetchFixedBroachsJson';
import type { Song, SongNoteGroup } from '../data/fetchSongsJson';
import { SONG_NOTE_GROUP_KEYS } from '../data/fetchSongsJson';
import { ATTRS } from '../constants';
import { normalizeAttribute, type AttributeName, type CardSkill } from './types';
import { LIGHT_MULTIPLIER, NOTE_RATE } from './constants';
import { parseSkill } from './teamBuilder';
import { calcBroachScoreBonus, resolveDeckBroachs } from './broachResolver';

export interface CardAppeal {
  Shout: number;
  Beat: number;
  Melody: number;
}

export interface CardStrengthEntry {
  card: Card;
  attribute: AttributeName;
  /** 特効・固有ブローチ適用後の属性値 */
  appeal: CardAppeal;
  appealTotal: number;
  /** 属性値由来スコア（種類9ブローチのスコアボーナス込み） */
  baseScore: number;
  /** スコアアップ期待値（縮小・判定補助系・スキルなしは 0） */
  skillExpected: number;
  totalScore: number;
  /** 選択曲での最大発動回数 = floor(発動機会 ÷ count) */
  maxActivations: number;
  skill: CardSkill | null;
  broachScoreBonus: number;
}

export type CompareGroup = 'scoreUp' | 'shrink';

/** スキル種別の比較グループ判定。縮小系以外（判定補助・スキルなし含む）は scoreUp 扱い */
export function classifyCard(card: Card): CompareGroup {
  const t = card.ap_skill_type;
  if (t && (t === SKILL_TYPE.SHRINK || t.startsWith(SKILL_TYPE.SHRINK_PREFIX))) return 'shrink';
  return 'scoreUp';
}

/**
 * 属性値から選択曲の属性値由来スコアを計算する。
 * 1ノーツのスコアは属性・白色・グループのみで決まるため、シャッフル不要で
 * グループ別カウント × 1ノーツ基底値を決定的に合算できる (simulation.ts calcNoteScore と同式)。
 */
export function calcBaseScore(appeal: CardAppeal, song: Song): number {
  let total = 0;
  for (const groupKey of SONG_NOTE_GROUP_KEYS) {
    const group = song[groupKey] as SongNoteGroup | undefined;
    if (!group) continue;
    const mult = LIGHT_MULTIPLIER[groupKey];
    for (const attr of ATTRS) {
      for (const t of ['white', 'color'] as const) {
        const count = group[`${attr.key}_${t}` as keyof SongNoteGroup] || 0;
        if (!count) continue;
        const perNote = Math.floor(Math.floor(appeal[attr.name] * NOTE_RATE[t]) * mult);
        total += perNote * count;
      }
    }
  }
  return total;
}

/**
 * 特効・固有ブローチ適用後の属性値を計算する。
 * カードに複数ブローチがある場合は、1個ずつ装備した時の
 * (属性値由来スコア + 種類9スコアボーナス) が最大になるブローチを選ぶ。
 * 条件判定は単独デッキ [card, null×5] で resolveDeckBroachs を再利用する。
 */
export function calcCardStrengthAppeal(
  card: Card,
  allBroachs: FixedBroach[],
  song: Song,
  bonusMultiplier = 1,
): { appeal: CardAppeal; broachScoreBonus: number } {
  const s = Math.round((card.shout_max || 0) * bonusMultiplier);
  const b = Math.round((card.beat_max || 0) * bonusMultiplier);
  const m = Math.round((card.melody_max || 0) * bonusMultiplier);

  let best: { appeal: CardAppeal; broachScoreBonus: number } = {
    appeal: { Shout: s, Beat: b, Melody: m },
    broachScoreBonus: 0,
  };
  let bestScore = calcBaseScore(best.appeal, song);

  const deck: (Card | null)[] = [card, null, null, null, null, null];
  const cardBroachs = allBroachs.filter((br) => br.card_id === card.cardID);
  for (const br of cardBroachs) {
    if (br.id == null) continue;
    const resolved = resolveDeckBroachs(deck, cardBroachs, song, [br.id, null, null, null, null, null]);
    const broachScoreBonus = calcBroachScoreBonus(resolved);
    let aS = s, aB = b, aM = m;
    for (const rb of resolved.get(0) ?? []) {
      if (!rb.active || rb.broach.broach_type === 9) continue;
      const mult = rb.multiplier ?? 1;
      aS += (rb.broach.shout || 0) * mult;
      aB += (rb.broach.beat || 0) * mult;
      aM += (rb.broach.melody || 0) * mult;
    }
    const appeal = { Shout: aS, Beat: aB, Melody: aM };
    const score = calcBaseScore(appeal, song) + broachScoreBonus;
    if (score > bestScore) {
      best = { appeal, broachScoreBonus };
      bestScore = score;
    }
  }
  return best;
}

/** 1枚分の強さエントリを構築する */
export function buildCardStrengthEntry(
  card: Card,
  allBroachs: FixedBroach[],
  song: Song,
  bonusMultiplier = 1,
): CardStrengthEntry {
  const { appeal, broachScoreBonus } = calcCardStrengthAppeal(card, allBroachs, song, bonusMultiplier);
  const skill = parseSkill(card, 0);
  const baseScore = calcBaseScore(appeal, song) + broachScoreBonus;

  let skillExpected = 0;
  let maxActivations = 0;
  if (skill && skill.count > 0) {
    const denom = skill.isTimer ? (song.duration || 0) : (song.notes_count || 0);
    if (denom > 0) {
      maxActivations = Math.floor(denom / skill.count);
      if (!skill.isShrink) {
        skillExpected = Math.floor(maxActivations * (skill.per / 100) * skill.value);
      }
    }
  }

  return {
    card,
    attribute: normalizeAttribute(card.attribute),
    appeal,
    appealTotal: appeal.Shout + appeal.Beat + appeal.Melody,
    baseScore,
    skillExpected,
    totalScore: baseScore + skillExpected,
    maxActivations,
    skill,
    broachScoreBonus,
  };
}

/** 判定縮小系の多段ソート比較関数: ①効果秒数 → ②最大発動回数 → ③確率 → ④属性値合計（すべて優位が先） */
export function compareShrink(a: CardStrengthEntry, b: CardStrengthEntry): number {
  const av = a.skill?.value ?? 0;
  const bv = b.skill?.value ?? 0;
  if (av !== bv) return bv - av;
  if (a.maxActivations !== b.maxActivations) return b.maxActivations - a.maxActivations;
  const ap = a.skill?.per ?? 0;
  const bp = b.skill?.per ?? 0;
  if (ap !== bp) return bp - ap;
  return b.appealTotal - a.appealTotal;
}

/** 縦積み同率判定キー（秒数・最大発動回数・確率が一致 = 同率） */
export function shrinkTieKey(e: CardStrengthEntry): string {
  return `${e.skill?.value ?? 0}|${e.maxActivations}|${e.skill?.per ?? 0}`;
}

/** スコアの省略表記（1万以上は「12.3万」、未満はカンマ区切り） */
export function formatScore(v: number): string {
  if (v >= 10000) return `${(v / 10000).toFixed(1)}万`;
  return v.toLocaleString('ja-JP');
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `npm run test:unit`
Expected: 全テスト PASS（既存の engine / shrinkExclusion / specDiagrams テスト含む）

- [ ] **Step 6: コミット**

```bash
git add src/lib/score/teamBuilder.ts src/lib/score/cardStrength.ts tests/unit/score/cardStrength.test.ts
git commit -m "feat(score): 衣装単体強さ計算モジュール cardStrength を追加 (ADR 0007)"
```

---

### Task 2: 表示コンポーネント 3 点（ScoreUpChart / ShrinkChart / CompareDetailPanel)

表示専用（状態は親から props）。Svelte 5 runes 構文。ダークバリアント必須。

**Files:**
- Create: `src/components/compare/ScoreUpChart.svelte`
- Create: `src/components/compare/ShrinkChart.svelte`
- Create: `src/components/compare/CompareDetailPanel.svelte`

- [ ] **Step 1: ScoreUpChart.svelte を作成**

```svelte
<script lang="ts">
  import { formatScore, type CardStrengthEntry } from '../../lib/score/cardStrength';
  import { ATTR_HEX, CARD_THUMB_BASE_URL } from '../../lib/constants';
  import { bonusBadgeHtml, type EventBonusTier } from '../../lib/data/eventBonusTiers';

  type Props = {
    entries: CardStrengthEntry[];
    selectedIds: number[];
    tierOf: (entry: CardStrengthEntry) => EventBonusTier;
    onToggle: (entry: CardStrengthEntry) => void;
  };
  let { entries, selectedIds, tierOf, onToggle }: Props = $props();

  const CHART_HEIGHT = 220;
  const maxTotal = $derived(entries.length > 0 ? entries[0].totalScore : 0);

  function px(v: number): number {
    return maxTotal > 0 ? Math.round((v / maxTotal) * CHART_HEIGHT) : 0;
  }
</script>

{#if entries.length === 0}
  <p class="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">対象の衣装がありません</p>
{:else}
  <div class="overflow-x-auto">
    <div class="flex items-end gap-3 px-3 pt-5 pb-3 min-w-max">
      {#each entries as entry (entry.card.ID)}
        {@const selected = entry.card.ID != null && selectedIds.includes(entry.card.ID)}
        <button
          type="button"
          class="flex flex-col items-center w-16 shrink-0 cursor-pointer"
          data-testid="scoreup-bar"
          title={entry.card.cardname}
          onclick={() => onToggle(entry)}
        >
          <span class="text-[11px] font-bold text-gray-700 dark:text-slate-200">{formatScore(entry.totalScore)}</span>
          <span class="flex flex-col justify-end w-9" style={`height:${CHART_HEIGHT}px`}>
            <span class="block w-full bg-amber-400 dark:bg-amber-500 rounded-t-sm" style={`height:${px(entry.skillExpected)}px`}></span>
            <span class="block w-full bg-indigo-500 dark:bg-indigo-400" style={`height:${px(entry.baseScore)}px`}></span>
          </span>
          <img
            src={`${CARD_THUMB_BASE_URL}/${entry.card.cardID}.png`}
            alt={entry.card.cardname || ''}
            loading="lazy"
            class="w-12 h-12 mt-1.5 rounded border-[3px] object-cover"
            class:ring-2={selected}
            class:ring-indigo-500={selected}
            class:ring-offset-1={selected}
            style={`border-color:${ATTR_HEX[entry.attribute]}`}
          />
          <span class="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 leading-tight text-center break-words w-full">
            {entry.skill?.originalType ?? entry.card.ap_skill_type ?? 'スキルなし'}
          </span>
          {@html bonusBadgeHtml(tierOf(entry))}
        </button>
      {/each}
    </div>
  </div>
  <div class="flex flex-wrap items-center gap-4 px-3 pb-3 text-[11px] text-gray-600 dark:text-slate-300">
    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-indigo-500 dark:bg-indigo-400"></span>属性値由来スコア</span>
    <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-sm bg-amber-400 dark:bg-amber-500"></span>スキル期待値</span>
    <span class="text-gray-400 dark:text-slate-500">サムネ枠色 = 属性 / タップで詳細比較（最大4枚）</span>
  </div>
{/if}
```

- [ ] **Step 2: ShrinkChart.svelte を作成**

```svelte
<script lang="ts">
  import { shrinkTieKey, type CardStrengthEntry } from '../../lib/score/cardStrength';
  import { ATTR_HEX, CARD_THUMB_BASE_URL } from '../../lib/constants';
  import { bonusBadgeHtml, type EventBonusTier } from '../../lib/data/eventBonusTiers';

  type Props = {
    entries: CardStrengthEntry[];
    selectedIds: number[];
    tierOf: (entry: CardStrengthEntry) => EventBonusTier;
    onToggle: (entry: CardStrengthEntry) => void;
  };
  let { entries, selectedIds, tierOf, onToggle }: Props = $props();

  const CHART_HEIGHT = 150;

  interface ShrinkColumn {
    key: string;
    seconds: number;
    entries: CardStrengthEntry[];
  }

  /** ソート済み entries を同率（秒数・発動回数・確率が一致）ごとに1列へまとめる */
  const columns = $derived.by(() => {
    const cols: ShrinkColumn[] = [];
    for (const e of entries) {
      const key = shrinkTieKey(e);
      const last = cols[cols.length - 1];
      if (last && last.key === key) {
        last.entries.push(e);
      } else {
        cols.push({ key, seconds: e.skill?.value ?? 0, entries: [e] });
      }
    }
    return cols;
  });

  const maxSeconds = $derived(columns.length > 0 ? columns[0].seconds : 0);

  function px(seconds: number): number {
    return maxSeconds > 0 ? Math.round((seconds / maxSeconds) * CHART_HEIGHT) : 0;
  }

  function condLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    return s.isTimer ? `${s.count}秒毎` : `${s.count}コンボ毎`;
  }
</script>

{#if columns.length === 0}
  <p class="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">対象の衣装がありません</p>
{:else}
  <div class="overflow-x-auto">
    <div class="flex items-start gap-4 px-3 pt-5 pb-3 min-w-max">
      {#each columns as col (col.key)}
        <div class="flex flex-col items-center w-20 shrink-0" data-testid="shrink-col">
          <span class="text-[11px] font-bold text-gray-700 dark:text-slate-200">{col.seconds}秒</span>
          <span class="flex flex-col justify-end w-9" style={`height:${CHART_HEIGHT}px`}>
            <span class="block w-full bg-amber-400 dark:bg-amber-500 rounded-t-sm" style={`height:${px(col.seconds)}px`}></span>
          </span>
          <div class="flex flex-col gap-2 mt-1.5">
            {#each col.entries as entry (entry.card.ID)}
              {@const selected = entry.card.ID != null && selectedIds.includes(entry.card.ID)}
              <button
                type="button"
                class="flex flex-col items-center cursor-pointer"
                title={entry.card.cardname}
                onclick={() => onToggle(entry)}
              >
                <img
                  src={`${CARD_THUMB_BASE_URL}/${entry.card.cardID}.png`}
                  alt={entry.card.cardname || ''}
                  loading="lazy"
                  class="w-12 h-12 rounded border-[3px] object-cover"
                  class:ring-2={selected}
                  class:ring-indigo-500={selected}
                  class:ring-offset-1={selected}
                  style={`border-color:${ATTR_HEX[entry.attribute]}`}
                />
                <span class="text-[10px] text-gray-500 dark:text-slate-400 mt-0.5 leading-tight text-center">
                  {condLabel(entry)} / {entry.skill?.per ?? 0}%<br />
                  属性値 {entry.appealTotal.toLocaleString('ja-JP')}
                </span>
                {@html bonusBadgeHtml(tierOf(entry))}
              </button>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </div>
  <div class="px-3 pb-3 text-[11px] text-gray-400 dark:text-slate-500">
    棒の高さ = 1回あたりの効果秒数。秒数・発動回数・確率が同じ衣装は1列に縦積み。並び順: 効果秒数 → 最大発動回数 → 確率 → 属性値合計
  </div>
{/if}
```

- [ ] **Step 3: CompareDetailPanel.svelte を作成**

```svelte
<script lang="ts">
  import { formatScore, type CardStrengthEntry } from '../../lib/score/cardStrength';
  import { ATTR_HEX, CARD_THUMB_BASE_URL } from '../../lib/constants';

  type Props = {
    entries: CardStrengthEntry[];
    onRemove: (entry: CardStrengthEntry) => void;
    onClear: () => void;
  };
  let { entries, onRemove, onClear }: Props = $props();

  function condLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    return s.isTimer ? `${s.count}秒毎` : `${s.count}コンボ毎`;
  }

  function effectLabel(entry: CardStrengthEntry): string {
    const s = entry.skill;
    if (!s) return '-';
    if (s.isShrink) return `${s.value}秒 ×${s.rate}`;
    return `+${s.value.toLocaleString('ja-JP')}`;
  }

  /** 行内の最大値（強調表示用）。values の最大と一致する index を返す */
  function maxIndexes(values: number[]): Set<number> {
    const max = Math.max(...values);
    return new Set(values.map((v, i) => (v === max && max > 0 ? i : -1)).filter((i) => i >= 0));
  }

  const totalMax = $derived(maxIndexes(entries.map((e) => e.totalScore)));
  const baseMax = $derived(maxIndexes(entries.map((e) => e.baseScore)));
  const skillMax = $derived(maxIndexes(entries.map((e) => e.skillExpected)));
</script>

<div
  class="fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-slate-800 border-t-2 border-indigo-300 dark:border-indigo-700 shadow-[0_-4px_12px_rgba(0,0,0,0.12)]"
  data-testid="compare-detail"
>
  <div class="max-w-7xl mx-auto px-4 py-2">
    <div class="flex items-center justify-between mb-1">
      <span class="text-xs font-bold text-indigo-700 dark:text-indigo-300">詳細比較（{entries.length}/4枚）</span>
      <button type="button" class="text-xs text-gray-500 dark:text-slate-400 hover:text-red-600 cursor-pointer" onclick={onClear}>✕ クリア</button>
    </div>
    <div class="overflow-x-auto max-h-[45vh] overflow-y-auto">
      <table class="text-[11px] border-collapse w-full min-w-max">
        <thead>
          <tr>
            <th class="text-left text-gray-500 dark:text-slate-400 font-normal pr-2 py-1"></th>
            {#each entries as entry (entry.card.ID)}
              <th class="px-2 py-1 text-center font-medium">
                <div class="flex flex-col items-center gap-0.5">
                  <img
                    src={`${CARD_THUMB_BASE_URL}/${entry.card.cardID}.png`}
                    alt={entry.card.cardname || ''}
                    loading="lazy"
                    class="w-10 h-10 rounded border-2 object-cover"
                    style={`border-color:${ATTR_HEX[entry.attribute]}`}
                  />
                  <span class="max-w-32 truncate">{entry.card.cardname}</span>
                  <button type="button" class="text-[10px] text-gray-400 hover:text-red-600 cursor-pointer" onclick={() => onRemove(entry)}>外す</button>
                </div>
              </th>
            {/each}
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1 whitespace-nowrap">Shout / Beat / Melody</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center whitespace-nowrap">
                {entry.appeal.Shout.toLocaleString('ja-JP')} / {entry.appeal.Beat.toLocaleString('ja-JP')} / {entry.appeal.Melody.toLocaleString('ja-JP')}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1">スキル</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center whitespace-nowrap">{entry.skill?.originalType ?? entry.card.ap_skill_type ?? 'スキルなし'}</td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1">発動条件 / 確率 / 効果</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center whitespace-nowrap">{condLabel(entry)} / {entry.skill?.per ?? '-'}% / {effectLabel(entry)}</td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1">最大発動回数</td>
            {#each entries as entry (entry.card.ID)}
              <td class="px-2 py-1 text-center">{entry.skill ? `${entry.maxActivations}回` : '-'}</td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1">属性値由来スコア</td>
            {#each entries as entry, i (entry.card.ID)}
              <td class="px-2 py-1 text-center" class:font-bold={baseMax.has(i)} class:text-red-600={baseMax.has(i)} class:dark:text-red-400={baseMax.has(i)}>
                {formatScore(entry.baseScore)}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1">スキル期待値</td>
            {#each entries as entry, i (entry.card.ID)}
              <td class="px-2 py-1 text-center" class:font-bold={skillMax.has(i)} class:text-red-600={skillMax.has(i)} class:dark:text-red-400={skillMax.has(i)}>
                {formatScore(entry.skillExpected)}
              </td>
            {/each}
          </tr>
          <tr>
            <td class="text-gray-500 dark:text-slate-400 pr-2 py-1 font-bold">合計</td>
            {#each entries as entry, i (entry.card.ID)}
              <td class="px-2 py-1 text-center font-bold" class:text-red-600={totalMax.has(i)} class:dark:text-red-400={totalMax.has(i)}>
                {formatScore(entry.totalScore)}
              </td>
            {/each}
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
```

- [ ] **Step 4: 型チェック & コミット**

Run: `npx astro check 2>&1 | tail -5`（エラー 0 を確認。既存 warning は無視）

```bash
git add src/components/compare/
git commit -m "feat(compare): 衣装比較の表示コンポーネント3点を追加"
```

---

### Task 3: CardCompare 本体 + ページ + ナビゲーション

**Files:**
- Create: `src/components/CardCompare.svelte`
- Create: `src/pages/card-compare/index.astro`
- Modify: `src/components/HeaderNav.svelte:25-30`

- [ ] **Step 1: CardCompare.svelte を作成**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Card } from '../lib/data/fetchCardsJson';
  import { fetchCardsJson } from '../lib/data/fetchCardsJson';
  import type { Song } from '../lib/data/fetchSongsJson';
  import { fetchSongsJson, filterAllowedSongs, filterValidSongs } from '../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../lib/data/fetchFixedBroachsJson';
  import { fetchFixedBroachsJson } from '../lib/data/fetchFixedBroachsJson';
  import { refreshData } from '../lib/data/clientRefresh';
  import {
    buildLiveTierMap, EVENT_BONUS_MULTIPLIER, type EventBonusTier, type EventForBonus,
  } from '../lib/data/eventBonusTiers';
  import { STORAGE_KEYS, loadJson } from '../lib/storage';
  import {
    buildCardStrengthEntry, classifyCard, compareShrink, type CardStrengthEntry,
  } from '../lib/score/cardStrength';
  import ScoreUpChart from './compare/ScoreUpChart.svelte';
  import ShrinkChart from './compare/ShrinkChart.svelte';
  import CompareDetailPanel from './compare/CompareDetailPanel.svelte';

  type Props = {
    cards: Card[];
    songs: Song[];
    broachs: FixedBroach[];
    events: EventForBonus[];
    base: string;
  };
  let { cards: initialCards, songs: initialSongs, broachs: initialBroachs, events }: Props = $props();

  const DEFAULT_SONG_NAME = 'DIAMOND FUSION';

  let allCardsState = $state<Card[]>(initialCards);
  let allSongsState = $state<Song[]>(initialSongs);
  let allBroachsState = $state<FixedBroach[]>(initialBroachs);

  const tierMap = buildLiveTierMap(events);
  const hasLiveEvent = tierMap.size > 0;

  let ownedIds = $state<Set<string>>(new Set());
  let hasOwned = $state(false);
  let ownedOnly = $state(false);
  let applyBonus = $state(false);
  let tab = $state<'scoreUp' | 'shrink'>('scoreUp');
  let selectedSongId = $state<number | null>(null);
  let selectedIds = $state<number[]>([]);

  onMount(() => {
    const counts = loadJson<Record<string, number>>(STORAGE_KEYS.CARD_COUNTS, {});
    ownedIds = new Set(Object.keys(counts).filter((k) => counts[k] > 0));
    hasOwned = ownedIds.size > 0;
    ownedOnly = hasOwned;

    refreshData('cards', fetchCardsJson, (fresh) => {
      allCardsState = fresh as Card[];
    });
    refreshData('songs', async () => filterAllowedSongs(filterValidSongs(await fetchSongsJson())), (fresh) => {
      allSongsState = fresh as Song[];
    });
    refreshData('broachs', fetchFixedBroachsJson, (fresh) => {
      allBroachsState = fresh as FixedBroach[];
    });
  });

  // 初期選択曲: DIAMOND FUSION のうちノーツ数最大の難易度。見つからなければ先頭の曲
  $effect(() => {
    if (selectedSongId != null || allSongsState.length === 0) return;
    const candidates = allSongsState.filter((s) => s.song_name === DEFAULT_SONG_NAME);
    const pool = candidates.length > 0 ? candidates : allSongsState;
    const sorted = [...pool].sort((a, b) => (b.notes_count || 0) - (a.notes_count || 0));
    selectedSongId = sorted[0]?.id ?? null;
  });

  const selectedSong = $derived(allSongsState.find((s) => s.id === selectedSongId) ?? null);
  const urCards = $derived(allCardsState.filter((c) => c.rarity === 'UR'));
  const visibleCards = $derived(urCards.filter((c) => !ownedOnly || ownedIds.has(String(c.ID))));

  function tierFor(card: Card): EventBonusTier {
    if (!applyBonus || card.ID == null) return 'none';
    return tierMap.get(card.ID) ?? 'none';
  }

  const entries = $derived.by(() => {
    const song = selectedSong;
    if (!song) return [] as CardStrengthEntry[];
    return visibleCards.map((c) =>
      buildCardStrengthEntry(c, allBroachsState, song, EVENT_BONUS_MULTIPLIER[tierFor(c)]),
    );
  });

  const scoreUpEntries = $derived(
    [...entries.filter((e) => classifyCard(e.card) === 'scoreUp')].sort((a, b) => b.totalScore - a.totalScore),
  );
  const shrinkEntries = $derived(
    [...entries.filter((e) => classifyCard(e.card) === 'shrink')].sort(compareShrink),
  );

  const selectedEntries = $derived(
    selectedIds
      .map((id) => entries.find((e) => e.card.ID === id))
      .filter((e): e is CardStrengthEntry => !!e),
  );

  function toggleSelect(entry: CardStrengthEntry) {
    const id = entry.card.ID;
    if (id == null) return;
    if (selectedIds.includes(id)) {
      selectedIds = selectedIds.filter((x) => x !== id);
    } else if (selectedIds.length < 4) {
      selectedIds = [...selectedIds, id];
    }
  }

  function handleSongChange(e: Event) {
    const v = Number((e.currentTarget as HTMLSelectElement).value);
    selectedSongId = Number.isNaN(v) ? null : v;
    selectedIds = [];
  }

  const tierOf = (entry: CardStrengthEntry) => tierFor(entry.card);
</script>

<div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg p-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
  <label class="flex items-center gap-2">
    <span class="text-gray-600 dark:text-slate-300 shrink-0">楽曲</span>
    <select
      class="border border-gray-300 dark:border-slate-600 rounded px-2 py-1.5 text-sm bg-white dark:bg-slate-700 dark:text-slate-100 max-w-72 focus:outline-none focus:ring-2 focus:ring-indigo-400"
      value={selectedSongId != null ? String(selectedSongId) : ''}
      onchange={handleSongChange}
    >
      {#each allSongsState as s (s.id)}
        <option value={String(s.id)}>{s.song_name} ({s.difficulty || ''}) - {s.duration || '?'}秒 / {s.notes_count || '?'}ノーツ</option>
      {/each}
    </select>
  </label>
  <label class="flex items-center gap-1.5 cursor-pointer">
    <input type="checkbox" bind:checked={ownedOnly} disabled={!hasOwned} class="accent-indigo-600" />
    <span class="text-gray-700 dark:text-slate-200" class:opacity-50={!hasOwned}>所持のみ</span>
  </label>
  {#if hasLiveEvent}
    <label class="flex items-center gap-1.5 cursor-pointer">
      <input type="checkbox" bind:checked={applyBonus} class="accent-indigo-600" />
      <span class="text-gray-700 dark:text-slate-200">イベント特効を反映</span>
    </label>
  {/if}
  {#if !hasOwned}
    <span class="text-xs text-gray-400 dark:text-slate-500">所持衣装の登録がないため全件表示しています</span>
  {/if}
</div>

<div class="flex" role="tablist">
  <button
    type="button"
    role="tab"
    aria-selected={tab === 'scoreUp'}
    class="px-5 py-2 text-sm rounded-t-lg border border-b-0 cursor-pointer {tab === 'scoreUp'
      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-bold border-gray-200 dark:border-slate-700'
      : 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-transparent'}"
    onclick={() => (tab = 'scoreUp')}
  >スコアアップ</button>
  <button
    type="button"
    role="tab"
    aria-selected={tab === 'shrink'}
    class="px-5 py-2 text-sm rounded-t-lg border border-b-0 cursor-pointer {tab === 'shrink'
      ? 'bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 font-bold border-gray-200 dark:border-slate-700'
      : 'bg-gray-100 dark:bg-slate-900 text-gray-500 dark:text-slate-400 border-transparent'}"
    onclick={() => (tab = 'shrink')}
  >判定縮小</button>
</div>

<div class="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-b-lg rounded-tr-lg" class:pb-24={selectedEntries.length > 0}>
  {#if !selectedSong}
    <p class="text-sm text-gray-500 dark:text-slate-400 py-10 text-center">楽曲データを読み込んでいます…</p>
  {:else if tab === 'scoreUp'}
    <ScoreUpChart entries={scoreUpEntries} selectedIds={selectedIds} tierOf={tierOf} onToggle={toggleSelect} />
  {:else}
    <ShrinkChart entries={shrinkEntries} selectedIds={selectedIds} tierOf={tierOf} onToggle={toggleSelect} />
  {/if}
</div>

{#if selectedEntries.length > 0}
  <CompareDetailPanel entries={selectedEntries} onRemove={toggleSelect} onClear={() => (selectedIds = [])} />
{/if}
```

- [ ] **Step 2: index.astro を作成**

`src/pages/card-compare/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import CardCompare from '../../components/CardCompare.svelte';
import { fetchCardsJson } from '../../lib/data/fetchCardsJson.ts';
import { fetchSongsJson, filterValidSongs, filterAllowedSongs } from '../../lib/data/fetchSongsJson.ts';
import { fetchFixedBroachsJson } from '../../lib/data/fetchFixedBroachsJson.ts';
import { fetchEventsCsv, toEventForBonus } from '../../lib/data/fetchEventsCsv.ts';

const [allCards, allSongsRaw, allBroachs, allEvents] = await Promise.all([
  fetchCardsJson(),
  fetchSongsJson(),
  fetchFixedBroachsJson(),
  fetchEventsCsv(),
]);

const allSongs = filterAllowedSongs(filterValidSongs(allSongsRaw));
const eventsForBonus = allEvents.map(toEventForBonus);
const base = import.meta.env.BASE_URL;
---

<BaseLayout title="衣装比較">
  <h1 class="text-2xl font-bold mb-1">衣装比較</h1>
  <p class="text-xs text-gray-500 dark:text-slate-400 mb-4">
    UR 限定 / 全ノーツ Perfect 前提 / センタースキル除外 / 固有ブローチ装備込み。
    スコアアップ系は期待スコアの積み上げ、判定縮小系は効果秒数 → 最大発動回数 → 確率 → 属性値の優先順で並びます。
  </p>

  <CardCompare
    cards={allCards}
    songs={allSongs}
    broachs={allBroachs}
    events={eventsForBonus}
    base={base}
    client:only="svelte"
  />
</BaseLayout>
```

- [ ] **Step 3: HeaderNav に「衣装比較」を追加**

`src/components/HeaderNav.svelte` の `items` 内、スコア計算ドロップダウンの children を:

```ts
    {
      label: 'スコア計算',
      children: [
        { href: `${base}score-calc/`, label: 'スコア計算' },
        { href: `${base}score-calc/max-score-finder/`, label: '編成組合計算' },
        { href: `${base}card-compare/`, label: '衣装比較' },
      ],
    },
```

- [ ] **Step 4: dev サーバーで確認**

```bash
npm run dev   # run_in_background: true で起動、"ready in" をログで待つ
```

Playwright MCP / chrome-devtools MCP で `http://localhost:4321/card-compare/` を開き:
1. 初期表示: DIAMOND FUSION 選択済み・スコアアップタブに積み上げ棒が並ぶ（localStorage 未登録 → 全件表示の案内）
2. 判定縮小タブ切替: 同率縦積みの列が表示される
3. 棒をクリック → 詳細比較パネルが下部に出る。4枚まで追加・「外す」「✕ クリア」動作
4. ダークテーマ切替（フッターの月ボタン）で配色が破綻しないこと
5. スクリーンショットを `tmp/card-compare-scoreup.png` / `tmp/card-compare-shrink.png` / `tmp/card-compare-detail.png` に保存

- [ ] **Step 5: コミット**

```bash
git add src/components/CardCompare.svelte src/pages/card-compare/ src/components/HeaderNav.svelte
git commit -m "feat: 衣装比較ページ /card-compare/ を追加 (ADR 0007)"
```

---

### Task 4: E2E テスト

**Files:**
- Create: `tests/card-compare.test.ts`

- [ ] **Step 1: E2E テストを書く**

```ts
import { test, expect } from '@playwright/test';

const BASE = '/i7';

test.describe('衣装比較ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}/card-compare/`);
  });

  test('見出しと前提条件の説明が表示される', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '衣装比較' })).toBeVisible();
    await expect(page.getByText('全ノーツ Perfect 前提')).toBeVisible();
  });

  test('スコアアップタブに積み上げ棒グラフが表示される', async ({ page }) => {
    await expect(page.getByTestId('scoreup-bar').first()).toBeVisible({ timeout: 20000 });
  });

  test('判定縮小タブに切り替えると縮小ランキングが表示される', async ({ page }) => {
    await page.getByRole('tab', { name: '判定縮小' }).click();
    await expect(page.getByTestId('shrink-col').first()).toBeVisible({ timeout: 20000 });
  });

  test('棒をクリックすると詳細比較パネルが開閉する', async ({ page }) => {
    const bar = page.getByTestId('scoreup-bar').first();
    await bar.waitFor({ timeout: 20000 });
    await bar.click();
    await expect(page.getByTestId('compare-detail')).toBeVisible();
    await page.getByRole('button', { name: '✕ クリア' }).click();
    await expect(page.getByTestId('compare-detail')).toBeHidden();
  });

  test('楽曲セレクタの初期選択が DIAMOND FUSION', async ({ page }) => {
    const select = page.locator('select');
    await expect(select).toBeVisible({ timeout: 20000 });
    const label = await select.locator('option:checked').textContent();
    expect(label).toContain('DIAMOND FUSION');
  });
});
```

- [ ] **Step 2: 単体テスト & E2E 実行**

```bash
npm run test:unit                                  # 約1秒、全 PASS を確認
npm run test -- tests/card-compare.test.ts         # preview ビルド込み 5〜7分。timeout 600000 で実行
```

Expected: 全 PASS（webServer のビルドに約 5.5 分かかる。Bash timeout は 600000 ms）

- [ ] **Step 3: コミット**

```bash
git add tests/card-compare.test.ts
git commit -m "test: 衣装比較ページの E2E テストを追加"
```

---

### Task 5: リリース

- [ ] **Step 1: push & PR 作成**

```bash
git push -u origin feature/card-compare
gh pr create --title "feat: 衣装比較ページを追加 (ADR 0007)" --body "$(cat <<'EOF'
## 概要
UR 衣装の単体強さをスキル種別ごとの比較軸でランキング表示する `/card-compare/` ページを新設 (ADR 0007)。

- スコアアップ系: 属性値由来スコア + スキル期待値の積み上げ棒グラフ（降順）
- 判定縮小系: 効果秒数 → 最大発動回数 → 確率 → 属性値合計の多段ソート（同率は縦積み）
- 曲選択（初期 DIAMOND FUSION）/ 所持のみトグル / 開催中イベント特効トグル
- 棒タップで最大4枚の詳細比較パネル
- 計算は `src/lib/score/cardStrength.ts`（純粋関数）+ Vitest 単体テスト + Playwright E2E

スペック: docs/superpowers/specs/2026-06-11-card-compare-design.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2: マージ（CI を待たない: CLAUDE.md の Workflow 準拠）**

```bash
gh pr merge --squash --delete-branch
```

- [ ] **Step 3: タグ発行でリリース**

```bash
git checkout main && git pull
git tag v1.17.0 && git push origin v1.17.0
```

`release.yml` が GitHub Release を作成し、`deploy.yml` が Cloudflare Workers にデプロイする（workflow の完了は待たなくてよい）。

---

## Self-Review 済み事項

- スペック全要件のタスク対応を確認（前提条件 → cardStrength / UI → Task 2-3 / テスト → Task 1, 4 / 導線 → Task 3）
- `parseSkill` は重複実装せず export 追加で再利用。`resolveDeckBroachs` も同様
- `formatScore` / `shrinkTieKey` / `compareShrink` の名称は全タスクで一貫
- 状態の localStorage 永続化はしない（spec の YAGNI 判断）
- エラー処理: データはビルド時 props のためフェッチ失敗 UI は不要（クライアント更新失敗は `clientRefresh` が console.warn で握る既存挙動）。所持登録ゼロは全件フォールバック + 案内文を実装
