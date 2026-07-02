# スコア計算エンジン監査修正（H1/H2/M1/M2/M3/M4）実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 監査（claudedocs/score-logic-audit-2026-07-02.md）の深刻度 高・中 6 件を修正し、期待値 ≤ 理論最大値の不変条件・表示と計算の整合・画面間の設定引き継ぎ・計算ロジックの単一実装を回復する。

**Architecture:** 計算エンジン（`src/lib/score/`）の根本原因を修正し、UI（`src/components/`）は engine の出力を消費する形へ寄せる。仕様変更は ADR 0036〜0039 で決定済み。spec: `docs/superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md`

**Tech Stack:** TypeScript / Svelte 5 (runes) / Vitest（`tests/unit/`）/ Astro 7

## Global Constraints

- ブランチ: `fix/score-engine-audit`（作成済み。main へ直接コミットしない）
- テスト実行: `npm run test:unit`（約 1〜2 秒。630 テストが既存）
- カバレッジゲート 95%（ADR 0032）を割らないこと — 新規分岐には必ずテストを付ける
- ユーザー可視テキストは「カード」でなく「衣装」、「共有ブローチ」でなく「共通ブローチ」
- 内部識別子は `broach` 綴り（`brooch` に直さない）
- コミットメッセージ末尾: `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- 縮小 1 種 rate のみの編成では期待値が現行と数値一致すること（golden 348,051 / スプレッドシートオラクル照合を壊さない）

---

### Task 1: parseSkill 入力衛生 — 判定ガード/スコアダウン除外と per クランプ（H2 + H1(b)、ADR 0037）

**Files:**
- Modify: `src/lib/data/fetchCardsJson.ts:74-83`（SKILL_TYPE）
- Modify: `src/lib/score/teamBuilder.ts:24-61`（parseSkill）
- Test: `tests/unit/score/parseSkillHygiene.test.ts`（新規）

**Interfaces:**
- Consumes: `parseSkill(card: Card, slotIndex: number, skillLevel?: 1|2|3|4|5): CardSkill | null`（既存）
- Produces: `SKILL_TYPE.SCORE_DOWN = '判定拡大スコアダウン'`。parseSkill は判定ガード/スコアダウンで null を返し、返す `CardSkill.per` は常に ≤ 100

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/unit/score/parseSkillHygiene.test.ts
import { describe, it, expect } from 'vitest';
import { parseSkill } from '../../../src/lib/score/teamBuilder';
import type { Card } from '../../../src/lib/data/fetchCardsJson';

/** parseSkill が参照するフィールドのみ持つ最小 Card を作る */
function makeCard(over: Record<string, unknown>): Card {
  return {
    ID: 1, cardID: 1, cardname: 'テスト', name: 'テスト', rarity: 'UR', attribute: 'Shout',
    sp_time: 0,
    ...over,
  } as unknown as Card;
}

describe('parseSkill 入力衛生 (ADR 0037)', () => {
  it('判定ガード(MISS→Perfect) はスキルなし (null) 扱いになる', () => {
    // 実データ ID 142 相当: L1-L4 に count/per/value があり L5 は空
    const card = makeCard({
      ap_skill_type: '判定ガード(MISS→Perfect)',
      ap_skill_1_count: 18, ap_skill_1_per: 36, ap_skill_1_value: 4, ap_skill_1_rate: 0,
    });
    expect(parseSkill(card, 0, 5)).toBeNull();
  });

  it('判定拡大スコアダウン はスキルなし (null) 扱いになる', () => {
    // 実データ ID 182 相当
    const card = makeCard({
      ap_skill_type: '判定拡大スコアダウン',
      ap_skill_1_count: 18, ap_skill_1_per: 37, ap_skill_1_value: 4, ap_skill_1_rate: 0,
    });
    expect(parseSkill(card, 0, 5)).toBeNull();
  });

  it('per > 100 の実データは 100 にクランプされる', () => {
    // 実データ ID 3144 相当: L1 のみ per=360 (36.0% の入力ミス疑い)、L5 空 → L1 へフォールバック
    const card = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_1_count: 18, ap_skill_1_per: 360, ap_skill_1_value: 900, ap_skill_1_rate: 0,
    });
    const skill = parseSkill(card, 0, 5);
    expect(skill).not.toBeNull();
    expect(skill!.per).toBe(100);
  });

  it('per ≤ 100 の通常データは変化しない', () => {
    const card = makeCard({
      ap_skill_type: 'スコアアップ（タイマー）',
      ap_skill_1_count: 18, ap_skill_1_per: 54, ap_skill_1_value: 900, ap_skill_1_rate: 0,
    });
    expect(parseSkill(card, 0, 5)!.per).toBe(54);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/parseSkillHygiene.test.ts`
Expected: FAIL — 判定ガード/スコアダウンのテストで `parseSkill` が CardSkill を返し（null でない）、per=360 テストで 360 が返る

- [ ] **Step 3: 実装**

`src/lib/data/fetchCardsJson.ts` の SKILL_TYPE に追加:

```typescript
export const SKILL_TYPE = {
  MISS_TO_GOOD: 'MISS→Good',
  SCOREUP_TIMER: 'スコアアップ（タイマー）',
  SCOREUP_PREFIX: 'スコアアップ（',
  SHRINK: '判定縮小スコアアップ',
  SHRINK_PREFIX: '判定縮小（',
  SHRINK_TIMER: '判定縮小（タイマー）',
  BAD_TO_PERFECT: '判定強化(BAD→Perfect)',
  MISS_TO_PERFECT: '判定ガード(MISS→Perfect)',
  SCORE_DOWN: '判定拡大スコアダウン',
} as const;
```

`src/lib/score/teamBuilder.ts` parseSkill の除外条件（現在の line 27）を差し替え:

```typescript
  const type = card.ap_skill_type;
  // 判定補助系スキル（判定ガード・スコアダウン含む）はスコアに影響しないため null を返す (ADR 0037)
  if (
    !type
    || type === SKILL_TYPE.MISS_TO_GOOD
    || type === SKILL_TYPE.BAD_TO_PERFECT
    || type === SKILL_TYPE.MISS_TO_PERFECT
    || type === SKILL_TYPE.SCORE_DOWN
  ) return null;
```

同じく parseSkill の return で per をクランプ（ADR 0037。シートの per>100 入力ミスに対する防御）:

```typescript
  return {
    cardIndex: slotIndex,
    skillType,
    originalType: type,
    /* v8 ignore next 3 -- count/per/value は usable レベルで truthy 保証済みのため || 0 の偽側へ到達しない */
    count: count || 0,
    per: Math.min(per || 0, 100),
    value: value || 0,
    rate: rate || 0,
    isTimer,
    isShrink,
    spTime: card.sp_time || 0,
  };
```

- [ ] **Step 4: テストがパスすることを確認**

Run: `npx vitest run tests/unit/score/parseSkillHygiene.test.ts`
Expected: PASS（4 件）

- [ ] **Step 5: 全体テスト**

Run: `npm run test:unit`
Expected: 全パス。既存テストに per>100 / 判定ガードのカードを使うものはないはずだが、失敗した場合は該当テストの前提を確認し（誤って scoreUp 扱いを期待しているだけなら）期待値を修正する

- [ ] **Step 6: コミット**

```bash
git add src/lib/data/fetchCardsJson.ts src/lib/score/teamBuilder.ts tests/unit/score/parseSkillHygiene.test.ts
git commit -m "fix: 判定ガード・スコアダウンをスコア計算から除外し発動率を100%にクランプ (ADR 0037)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: 期待値の縮小 rate 加重化と飽和キャップ補正（H1(a)(c)、ADR 0036）

**Files:**
- Modify: `src/lib/score/simulation.ts:73-133`（calcShrinkCoverage）、`src/lib/score/simulation.ts:308-368`（calcExpectedScore）
- Test: `tests/unit/score/expectedInvariants.test.ts`（新規）

**Interfaces:**
- Consumes: `calcShrinkCoverage(team, notesCount, offsetSeconds?, excludeHeadCount?)`（既存）
- Produces: calcShrinkCoverage の戻り値に `expectedWeightedCoverageRate: number` を追加（rate 加重・キャップ済み。calcExpectedScore 専用）。既存フィールドのうち `expectedCoveredSeconds` / `expectedCoverageRate` のキャップ上限が `effectiveSeconds` から `capSeconds`（構造的到達可能秒数）に変わる（非飽和時は不変）

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/unit/score/expectedInvariants.test.ts
import { describe, it, expect } from 'vitest';
import {
  calcExpectedScore, calcMaxScore, calcMinScore,
} from '../../../src/lib/score/simulation';
import type { ComputedTeam, CardSkill, FlatNote, DeckCard } from '../../../src/lib/score/types';

function makeNotes(n: number, excludedHead = 0): FlatNote[] {
  return Array.from({ length: n }, (_, i) => ({
    attribute: 'Shout' as const,
    type: 'white' as const,
    group: 'light_2', // LIGHT_MULTIPLIER = 1.0
    excluded: i < excludedHead,
  }));
}

function shrinkSkill(over: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0, skillType: 'shrink', originalType: '判定縮小スコアアップ',
    count: 20, per: 54, value: 5, rate: 1.6, isTimer: false, isShrink: true, spTime: 0,
    ...over,
  };
}

function makeTeam(skills: (CardSkill | null)[], appeal = 10007, duration = 100): ComputedTeam {
  const cards: DeckCard[] = skills.map((skill, i) => ({
    cardId: i + 1, cardID: i + 1, cardname: `c${i}`, name: `n${i}`, rarity: 'UR',
    attribute: 'Shout', shout_max: 0, beat_max: 0, melody_max: 0,
    skill: skill ? { ...skill, cardIndex: i } : null,
    broachShout: 0, broachBeat: 0, broachMelody: 0, slotIndex: i, bonusMultiplier: 1,
  }));
  return {
    Shout: appeal, Beat: appeal, Melody: appeal, cards, songDuration: duration,
    rawShout: appeal, rawBeat: appeal, rawMelody: appeal,
    broachShout: 0, broachBeat: 0, broachMelody: 0, broachScoreBonus: 0,
    centerShout: 0, centerBeat: 0, centerMelody: 0,
    friendShout: 0, friendBeat: 0, friendMelody: 0,
  } as ComputedTeam;
}

describe('期待値 ≤ 理論最大値の不変条件 (ADR 0036)', () => {
  it('縮小 rate 混在デッキでも expected ≤ max (監査 F1 の再現ケース)', () => {
    // rate1.6×1枚(count40) + rate1.2×4枚(count20)、100s/400ノーツ
    const team = makeTeam([
      shrinkSkill({ count: 40, rate: 1.6, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
      shrinkSkill({ count: 20, rate: 1.2, per: 54 }),
    ]);
    const notes = makeNotes(400);
    const expected = calcExpectedScore(team, notes, 400).finalScore;
    const max = calcMaxScore(team, notes);
    const min = calcMinScore(team, notes);
    expect(expected).toBeLessThanOrEqual(max);
    expect(min).toBeLessThanOrEqual(expected);
  });

  it('期待カバー率が飽和する編成でも expected ≤ max (監査 F3 の再現ケース)', () => {
    // count=20/per=54/value=5/rate=1.6 ×5枚、100s/400ノーツ (実データ範囲内のパラメータ)
    const team = makeTeam(Array.from({ length: 5 }, () => shrinkSkill({})));
    const notes = makeNotes(400);
    expect(calcExpectedScore(team, notes, 400).finalScore)
      .toBeLessThanOrEqual(calcMaxScore(team, notes));
  });

  it('先頭除外つきの飽和編成でも expected ≤ max', () => {
    const team = makeTeam(Array.from({ length: 5 }, () => shrinkSkill({})));
    const notes = makeNotes(400, 20);
    expect(calcExpectedScore(team, notes, 400).finalScore)
      .toBeLessThanOrEqual(calcMaxScore(team, notes));
  });

  it('単一 rate・非飽和の編成では従来式と同値 (rate 加重の後方互換)', () => {
    // 縮小1枚: 期待カバー秒 = floor(400/20)×5×0.54 = 54秒 < capSeconds → キャップ非発動
    const team = makeTeam([shrinkSkill({}), null, null, null, null]);
    const notes = makeNotes(400);
    const e = calcExpectedScore(team, notes, 400);
    // 従来式: floor(eligibleBase × (1.6−1) × 期待カバー率) と一致すること
    // eligibleBase = 400 × floor(10007×0.025) = 400 × 250 = 100000
    // 期待カバー率 = 54 / 100 = 0.54 → shrinkExpected = floor(100000 × 0.6 × 0.54) = 32400
    expect(e.shrinkExpected).toBe(32400);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/expectedInvariants.test.ts`
Expected: FAIL — rate 混在ケースと飽和ケースで expected > max（後方互換ケースは PASS のはず）

注意: `makeTeam` の `centerShout` 等 6 フィールドは Task 6 で ComputedTeam に追加するため、この時点では `as ComputedTeam` キャストで通す（余剰プロパティは無害）。

- [ ] **Step 3: calcShrinkCoverage に rate 加重と構造キャップを実装**

`src/lib/score/simulation.ts` の `calcShrinkCoverage`（line 73-133）を次のように変更する。戻り値型（インライン）へ `expectedWeightedCoverageRate: number` を追加し、`zero` オブジェクトにも `expectedWeightedCoverageRate: 0` を足す:

```typescript
  // 各スキルの発動回数 × 持続秒 (と × 確率 / × (rate−1) 加重) を単純加算 (ADR 0036)
  let rawCoveredSeconds = 0;
  let rawExpectedCoveredSeconds = 0;
  let rawExpectedWeightedSeconds = 0; // Σ 期待カバー秒ᵢ × (rateᵢ − 1)
  let minNoteShrinkCount = Infinity;  // ノート型縮小の count 最小値 (構造キャップ用)
  for (const dc of shrinkCards) {
    const skill = dc.skill!;
    const numActivations = calcShrinkActivationCount(skill, team, notesCount, excludeHeadCount);
    rawCoveredSeconds += numActivations * skill.value;
    const expSec = numActivations * skill.value * (skill.per / 100);
    rawExpectedCoveredSeconds += expSec;
    rawExpectedWeightedSeconds += expSec * (skill.rate - 1.0);
    if (!isShrinkTimer(skill) && skill.count < minNoteShrinkCount) minNoteShrinkCount = skill.count;
  }

  // 構造的到達可能秒数キャップ (ADR 0036):
  // 理論最大値の発動モデルでもノート型縮小は先頭 count ノーツ分をカバーできないため、
  // 期待カバー秒の上限を effectiveSeconds からその区間だけ控除した値にする。
  const headCapSeconds = Number.isFinite(minNoteShrinkCount)
    ? (minNoteShrinkCount / notesCount) * team.songDuration
    : 0;
  const capSeconds = Math.max(0, effectiveSeconds - headCapSeconds);

  // 表示用カバー率は従来どおり effectiveSeconds でキャップ、期待値系は capSeconds でキャップ
  const coveredSeconds = Math.min(rawCoveredSeconds, effectiveSeconds);
  const expectedCoveredSeconds = Math.min(rawExpectedCoveredSeconds, capSeconds);
  const expectedScale = rawExpectedCoveredSeconds > capSeconds && rawExpectedCoveredSeconds > 0
    ? capSeconds / rawExpectedCoveredSeconds
    : 1;
  const expectedWeightedCoverageRate =
    (rawExpectedWeightedSeconds * expectedScale) / effectiveSeconds;

  return {
    coverageRate: coveredSeconds / effectiveSeconds,
    coveredSeconds,
    rawCoverageRate: rawCoveredSeconds / effectiveSeconds,
    rawCoveredSeconds,
    expectedCoverageRate: expectedCoveredSeconds / effectiveSeconds,
    expectedCoveredSeconds,
    rawExpectedCoverageRate: rawExpectedCoveredSeconds / effectiveSeconds,
    rawExpectedCoveredSeconds,
    expectedWeightedCoverageRate,
    effectiveSeconds,
  };
```

docstring（line 59-72）に追記: 「期待値スコア用の `expectedWeightedCoverageRate` はスキルごとに (rateᵢ−1) を加重し、構造的到達可能秒数（effectiveSeconds − 最小 count ノーツ分）でキャップする (ADR 0036)」

- [ ] **Step 4: calcExpectedScore を rate 加重に書き換え**

`calcExpectedScore`（line 341-362 の縮小期待値ブロック）から `maxRate` の算出ループを削除し、次に差し替える:

```typescript
  // 縮小期待値: excluded ノートを除いた対象素点 × rate 加重期待カバー率 (ADR 0036)
  // 単一 rate の編成では従来式 (maxRate − 1) × 期待カバー率 と同値。
  const excludedCount = notes.filter(n => n.excluded).length;
  let eligibleBaseScore = 0;
  for (const note of notes) {
    if (note.excluded) continue;
    eligibleBaseScore += calcNoteScore(getAppeal(team, note.attribute, assist), note);
  }

  let shrinkExpected = 0;
  const coverage = calcShrinkCoverage(team, notesCount, 0, excludedCount);
  if (coverage && coverage.effectiveSeconds > 0) {
    shrinkExpected = Math.floor(eligibleBaseScore * coverage.expectedWeightedCoverageRate);
  }
```

関数ヘッダの docstring も「縮小期待値: eligibleBaseScore × Σ(期待カバー秒ᵢ × (rateᵢ−1)) / effectiveSeconds（構造キャップ付き、ADR 0036）」へ更新する。

- [ ] **Step 5: テストがパスすることを確認**

Run: `npx vitest run tests/unit/score/expectedInvariants.test.ts`
Expected: PASS（4 件）

- [ ] **Step 6: golden・オラクル照合が不変であることを確認**

Run: `npm run test:unit`
Expected: 全パス。特に `engine.test.ts` の「calcExpectedScore.finalScore は 348,051 と一致」と `spreadsheetDiff.test.ts` が PASS のままであること（単一 rate・非飽和のため計算結果は不変のはず）。
もし 348,051 がずれた場合は capSeconds の控除が非飽和ケースへ影響している実装ミス（キャップは `rawExpectedCoveredSeconds > capSeconds` のときのみ効く）なので修正する。

- [ ] **Step 7: コミット**

```bash
git add src/lib/score/simulation.ts tests/unit/score/expectedInvariants.test.ts
git commit -m "fix: 期待値スコアを縮小 rate 加重に変更し構造的到達可能秒数でキャップ (ADR 0036)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: 発動回数の分母を実挙動に統一（M2、ADR 0036）

**Files:**
- Modify: `src/lib/score/simulation.ts:416-436`（calcCardSkillMaxActivations）
- Modify: `src/lib/score/deckSkillDistribution.ts:35-39, 92`
- Modify: `src/components/score/DeckSkillDistribution.svelte:29-34`
- Modify: `src/components/score/ScoreCalcResults.svelte:109`
- Test: `tests/unit/score/expectedInvariants.test.ts`（追記）

**Interfaces:**
- Produces: `calcCardSkillMaxActivations(team, notesCount, slotIndex, excludedCount = 0): number` — ノート型縮小スキルは `floor((notesCount − excludedCount) / count)` を返す（`calcShrinkActivationCount` へ委譲）。非縮小・タイマーは従来どおり
- Produces: `buildDeckSkillDistribution(team, notesCount, options, excludedCount = 0): DeckSkillDistEntry[]`

- [ ] **Step 1: 失敗するテストを書く（expectedInvariants.test.ts へ追記）**

```typescript
import { calcCardSkillMaxActivations } from '../../../src/lib/score/simulation';

describe('calcCardSkillMaxActivations の分母統一 (ADR 0036)', () => {
  it('ノート型縮小スキルは先頭除外ノーツを分母から引く', () => {
    // 総 500 ノーツ・縮小 count=50・除外 50 → floor((500−50)/50) = 9 (従来は 10)
    const team = makeTeam([shrinkSkill({ count: 50 }), null, null, null, null]);
    expect(calcCardSkillMaxActivations(team, 500, 0, 50)).toBe(9);
    expect(calcCardSkillMaxActivations(team, 500, 0)).toBe(10); // 除外なしは従来どおり
  });

  it('非縮小スキルは除外ノーツの影響を受けない', () => {
    const scoreUp: CardSkill = {
      cardIndex: 0, skillType: 'scoreUp', originalType: 'スコアアップ（Perfect）',
      count: 50, per: 50, value: 100, rate: 0, isTimer: false, isShrink: false, spTime: 0,
    };
    const team = makeTeam([scoreUp, null, null, null, null]);
    expect(calcCardSkillMaxActivations(team, 500, 0, 50)).toBe(10);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/expectedInvariants.test.ts`
Expected: FAIL — 縮小 + 除外 50 のケースで 10 が返る

- [ ] **Step 3: 実装**

`calcCardSkillMaxActivations` を差し替え（docstring の「先頭除外は発動回数の算出には影響しない」の記述を削除）:

```typescript
/**
 * 単一カードのスキル最大発動数（理論上の上限発動回数）。
 * - タイマー（スコアアップ / 判定縮小）: floor( songDuration / count )
 * - ノート型スコアアップ: floor( notesCount / count )
 * - ノート型判定縮小: floor( (notesCount − excludedCount) / count )
 *   — 実シミュレーションは excluded ノーツでカウンタを進めないため分母を揃える (ADR 0036)
 * 発動確率 per は考慮せず、カウント条件を満たし得る最大回数を返す。
 */
export function calcCardSkillMaxActivations(
  team: ComputedTeam,
  notesCount: number,
  slotIndex: number,
  excludedCount: number = 0,
): number {
  const dc = team.cards.find(c => c.slotIndex === slotIndex);
  if (!dc || !dc.skill || dc.skill.count <= 0) return 0;
  const skill = dc.skill;
  if (skill.isShrink) {
    return calcShrinkActivationCount(skill, team, notesCount, excludedCount);
  }
  const denom = skill.isTimer ? team.songDuration : notesCount;
  if (denom <= 0) return 0;
  return Math.floor(denom / skill.count);
}
```

`src/lib/score/deckSkillDistribution.ts`: シグネチャに `excludedCount: number = 0` を追加し、line 92 を `n = calcCardSkillMaxActivations(team, notesCount, slotIndex, excludedCount);` へ:

```typescript
export function buildDeckSkillDistribution(
  team: ComputedTeam,
  notesCount: number,
  options: { scoreUpAssist: boolean; scoreUpBadgeRate: number },
  excludedCount: number = 0,
): DeckSkillDistEntry[] {
```

`src/components/score/DeckSkillDistribution.svelte`（line 31）: 既に `exclusion` を計算済みなので渡す:

```typescript
    return buildDeckSkillDistribution(team, notes.length, {
      scoreUpAssist,
      scoreUpBadgeRate: Number(scoreUpBadgeRate) || 0,
    }, exclusion.totalExcluded);
```

`src/components/score/ScoreCalcResults.svelte`（line 109）:

```typescript
      const activations = calcCardSkillMaxActivations(calc.team, notesCount, i, calc.exclusion.totalExcluded);
```

- [ ] **Step 4: テスト確認とコミット**

Run: `npx vitest run tests/unit/score/expectedInvariants.test.ts && npm run test:unit`
Expected: 全パス（`deckSkillDistributionBranches.test.ts` は既定引数 0 のため不変）

```bash
git add src/lib/score/simulation.ts src/lib/score/deckSkillDistribution.ts src/components/score/DeckSkillDistribution.svelte src/components/score/ScoreCalcResults.svelte tests/unit/score/expectedInvariants.test.ts
git commit -m "fix: スキル最大発動回数の分母を実シミュレーション挙動と統一 (ADR 0036)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: RNG を sfc32 へ差し替え（M1、ADR 0038）

**Files:**
- Modify: `src/lib/score/rng.ts`（全面書き換え）
- Modify: `src/lib/score/noteFlattener.ts:5,31`、`src/lib/score/simulation.ts:15,640`、`src/lib/score/specDiagrams.ts:11,169,205,589`（import/instantiation のリネーム）
- Modify: `tests/unit/score/engine.test.ts`（シード固定 MC の固定値更新）ほか RNG 依存の固定値テスト
- Test: `tests/unit/score/rng.test.ts`（新規）

**Interfaces:**
- Produces: `class Sfc32 { constructor(seed: number); next(): number /* [0,1) */ }`（`XorShift128Plus` は削除）

- [ ] **Step 1: 品質テストを書く（現行実装では失敗する）**

```typescript
// tests/unit/score/rng.test.ts
import { describe, it, expect } from 'vitest';
import { Sfc32 } from '../../../src/lib/score/rng';

/** 16 bin の χ² 統計量 (df=15, 5% 臨界値 25.0) */
function chiSquared16(rng: Sfc32, samples: number): number {
  const bins = new Array<number>(16).fill(0);
  for (let i = 0; i < samples; i++) bins[Math.floor(rng.next() * 16)]++;
  const exp = samples / 16;
  return bins.reduce((acc, o) => acc + ((o - exp) ** 2) / exp, 0);
}

describe('Sfc32 (ADR 0038)', () => {
  it('χ² 一様性: 複数シードで 5% 臨界値 25.0 を下回る', () => {
    // 決定論的 (シード固定) なので flaky にはならない
    for (const seed of [1, 42, 12345, 999983]) {
      expect(chiSquared16(new Sfc32(seed), 100_000)).toBeLessThan(25.0);
    }
  });

  it('seed=0 でも初期出力が縮退しない', () => {
    const rng = new Sfc32(0);
    const a = rng.next();
    const b = rng.next();
    expect(a).not.toBe(b);
  });

  it('シード再現性: 同一シードは同一列を返す', () => {
    const a = new Sfc32(42);
    const b = new Sfc32(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('全出力が [0,1) に収まる', () => {
    const rng = new Sfc32(7);
    for (let i = 0; i < 10_000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/rng.test.ts`
Expected: FAIL with "Sfc32 is not exported"（または import エラー）

- [ ] **Step 3: rng.ts を書き換え**

```typescript
/**
 * sfc32 シード付き疑似乱数生成器 (ADR 0038)
 *
 * 32bit 演算のみで動作する既知の良性 PRNG。シードは splitmix32 で
 * 32bit 整数から 4 つの内部状態へ展開する（Date.now() 級シードでも
 * `seed >>> 0` で受けるため浮動小数点精度落ちがない）。
 */
export class Sfc32 {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(seed: number) {
    // splitmix32 でシードから 4 状態を生成
    let s = seed >>> 0;
    const split = (): number => {
      s = (s + 0x9e3779b9) | 0;
      let t = s ^ (s >>> 16);
      t = Math.imul(t, 0x21f0aaad);
      t ^= t >>> 15;
      t = Math.imul(t, 0x735a2d97);
      return (t ^ (t >>> 15)) >>> 0;
    };
    this.a = split();
    this.b = split();
    this.c = split();
    this.d = split();
    // 状態を混合するウォームアップ
    for (let i = 0; i < 12; i++) this.next();
  }

  /** 0.0 以上 1.0 未満の浮動小数点数を返す */
  next(): number {
    const t = (((this.a + this.b) | 0) + this.d) | 0;
    this.d = (this.d + 1) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = ((this.c << 21) | (this.c >>> 11)) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
}
```

import 3 ファイルを更新（`XorShift128Plus` → `Sfc32`）:
- `noteFlattener.ts:5` `import { Sfc32 } from './rng';` / `:31` `const rng = new Sfc32(seed ?? Date.now());`
- `simulation.ts:15` `import { Sfc32 } from './rng';` / `:640` `const rng = new Sfc32(seed ?? Date.now());`（`runOnce` の引数型 `rng: XorShift128Plus` も `rng: Sfc32` へ）
- `specDiagrams.ts:11` と 3 箇所の `new XorShift128Plus(...)` → `new Sfc32(...)`

- [ ] **Step 4: RNG 依存の固定値テストを更新**

Run: `npm run test:unit 2>&1 | head -80`
Expected: `rng.test.ts` は PASS。`engine.test.ts` の「runSimulation の mcMin / mcMax / mean / stddev は固定値と一致」等、シード固定の MC 固定値テストが FAIL する。

失敗した各テストについて、**乱数列の変化による期待値の更新のみ**を行う: 失敗メッセージの actual 値を読み取り、テスト内の固定値を actual に置き換える。±3% / ±6% の収束テストは固定値でないため自然にパスするはず（パスしない場合は実装バグとして調査する — 収束閾値を緩めて逃げないこと）。
`specDiagrams.test.ts` にも乱数依存の固定値があれば同様に更新する。

Run: `npm run test:unit`
Expected: 全パス

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/rng.ts src/lib/score/noteFlattener.ts src/lib/score/simulation.ts src/lib/score/specDiagrams.ts tests/unit/score/rng.test.ts tests/unit/score/engine.test.ts
# specDiagrams.test.ts 等も更新した場合は追加
git commit -m "fix: MC シミュレーションの乱数生成器を sfc32 に差し替え (ADR 0038)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: 編成組合計算 → スコア計算の scoreOptions 引き継ぎ（M3）

**Files:**
- Modify: `src/components/ScoreCalc.svelte:90-131`（buildStateObject / applyState / アシスト checkbox の保存）
- Modify: `src/components/score/SearchResults.svelte:44-58`（sendToScoreCalc）
- Modify: `src/components/MaxScoreFinder.svelte`（SearchResults への props 追加）

**Interfaces:**
- Produces: `i7_score_calc_state` に `scoreUpAssist: boolean` フィールドが追加される（`badgeRate` は既存）。SearchResults は props `scoreUpAssist: boolean` / `scoreUpBadgeRate: number` を受け取る

注: これは Svelte コンポーネント間の配線のため単体テストは書かず、Task 7 の dev サーバー実機確認で検証する（既存 E2E の対象範囲外の画面遷移フロー）。

- [ ] **Step 1: ScoreCalc.svelte — アシストを状態保存へ追加**

`buildStateObject()`（line 90-101）へ追加:

```typescript
      skillLevels: [...deckState.skillLevels],
      scoreUpAssist: !!scoreUpAssist,
      badgeRate: Number(scoreUpBadgeRate) || 0,
```

`applyState()`（line 127 付近）へ追加:

```typescript
    if (typeof state.scoreUpAssist === 'boolean') scoreUpAssist = state.scoreUpAssist;
    if (typeof state.badgeRate === 'number') scoreUpBadgeRate = state.badgeRate;
```

アシストのチェックボックス（line 330 付近、`bind:checked={scoreUpAssist}`）に `onchange={saveState}` を追加（バッジ入力の `oninput={saveState}` と同様に、変更を即保存する）。

- [ ] **Step 2: MaxScoreFinder.svelte — SearchResults へ探索時の設定を渡す**

`<SearchResults ...>` のレンダリング箇所を探し（`grep -n "SearchResults" src/components/MaxScoreFinder.svelte`）、props を追加する。探索実行時の値（`scoreUpAssist` / `scoreUpBadgeRate` state）をそのまま渡す:

```svelte
<SearchResults {...既存props} scoreUpAssist={scoreUpAssist} scoreUpBadgeRate={Number(scoreUpBadgeRate) || 0} />
```

注意: 探索開始後にユーザーがトグルを変えた場合に「探索時の値」と「現在の値」がずれる可能性があるが、探索結果自体が古くなるため既存の他 props（tierMap 等）と同じ扱い（live 値）とする。

- [ ] **Step 3: SearchResults.svelte — sendToScoreCalc に引き継ぎを追加**

props 定義に `scoreUpAssist: boolean;` / `scoreUpBadgeRate: number;` を追加し、`sendToScoreCalc()`（line 44-58）の state へ追加:

```typescript
    const state = {
      songId: selectedSong.id,
      deckIds: rec.cardIds,
      bonusTiers: tiers,
      trained: [true, true, true, true, true, true],
      sharedBroachs: rec.sharedBroachIds ?? [[], [], [], [], [], []],
      skillLevels: [5, 5, 5, 5, 5, 5],
      scoreUpAssist,
      badgeRate: Number(scoreUpBadgeRate) || 0,
    };
```

- [ ] **Step 4: 型チェックとコミット**

Run: `npx astro check 2>&1 | tail -5`（または `npm run test:unit` で回帰确認）
Expected: 新規エラーなし

```bash
git add src/components/ScoreCalc.svelte src/components/MaxScoreFinder.svelte src/components/score/SearchResults.svelte
git commit -m "fix: 編成組合計算からスコア計算へアシスト・バッジ設定を引き継ぐ

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: 共有ブローチ容量ルールの一本化と CardDetailTable の engine 出力化（M4、ADR 0039）

**Files:**
- Modify: `src/lib/score/types.ts:55-68`（ComputedTeam にセンター/フレンド内訳を追加）
- Modify: `src/lib/score/teamBuilder.ts:91-240`（computeTeam: 容量ルール適用 + 内訳フィールド返却）
- Modify: `src/lib/score/deckState.ts:42-51`（clampSharedBroachs → broachCapacity 委譲）
- Modify: `src/lib/score/deckSkillDistribution.ts:40-56`（センタースキル再計算を team フィールド消費へ）
- Modify: `src/components/score/CardDetailTable.svelte`（手計算を computeTeam 消費へ）
- Test: `tests/unit/score/sharedBroachCapacity.test.ts`（新規）

**Interfaces:**
- Consumes: `broachCapacity(card: Card | null, hasFixedBroach: (card: Card) => boolean): number`（broachAssignment.ts 既存。leaf モジュールのため teamBuilder / deckState から import しても循環しない）
- Produces: `ComputedTeam` に `centerShout/centerBeat/centerMelody/friendShout/friendBeat/friendMelody: number` を追加。`computeTeam` は共有ブローチを容量（非 UR=0 / 固有持ち UR=1 / それ以外 UR=2）まで しか加算しない

- [ ] **Step 1: 失敗するテストを書く**

```typescript
// tests/unit/score/sharedBroachCapacity.test.ts
import { describe, it, expect } from 'vitest';
import { computeTeam } from '../../../src/lib/score/teamBuilder';
import { SHARED_BROACHS } from '../../../src/lib/data/sharedBroachs';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { FixedBroach } from '../../../src/lib/data/fetchFixedBroachsJson';
import type { Song } from '../../../src/lib/data/fetchSongsJson';

const song = { song_name: 'test', duration: 100 } as unknown as Song;

function makeCard(over: Record<string, unknown>): Card {
  return {
    ID: 1, cardID: 101, cardname: 'テスト', name: 'アイドル', rarity: 'UR', attribute: 'Shout',
    shout_max: 1000, beat_max: 1000, melody_max: 1000, sp_time: 0,
    ...over,
  } as unknown as Card;
}

// 無条件 (targetAttribute なし) の共通ブローチを使う
const plain = SHARED_BROACHS.find(sb => !sb.targetAttribute)!;

describe('computeTeam の共有ブローチ容量ルール (ADR 0039)', () => {
  it('非 UR カードには共有ブローチが加算されない', () => {
    const deck = [makeCard({ rarity: 'SSR' }), null, null, null, null, null];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined,
      [[plain.id, plain.id], [], [], [], [], []]);
    expect(team.broachShout + team.broachBeat + team.broachMelody).toBe(0);
  });

  it('固有ブローチなしの UR は 2 個まで加算される', () => {
    const deck = [makeCard({}), null, null, null, null, null];
    const team = computeTeam(deck, [], song, undefined, undefined, undefined,
      [[plain.id, plain.id, plain.id], [], [], [], [], []]);
    expect(team.broachShout).toBe(plain.shout * 2);
    expect(team.broachBeat).toBe(plain.beat * 2);
    expect(team.broachMelody).toBe(plain.melody * 2);
  });

  it('固有ブローチ持ちの UR は 1 個まで加算される', () => {
    const fixed = { id: 1, card_id: 101, broach_type: 1, shout: 0, beat: 0, melody: 0 } as unknown as FixedBroach;
    const deck = [makeCard({}), null, null, null, null, null];
    const team = computeTeam(deck, [fixed], song, undefined, undefined, undefined,
      [[plain.id, plain.id], [], [], [], [], []]);
    // 共有ブローチ分は 1 個分のみ (固有ブローチ自体の値は 0 に設定済み)
    expect(team.broachShout).toBe(plain.shout * 1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認**

Run: `npx vitest run tests/unit/score/sharedBroachCapacity.test.ts`
Expected: FAIL — 非 UR にも加算され、3 個目・2 個目も加算される

注意: 固有ブローチのテストで `resolveDeckBroachs` が fixed broach を自動採用して stats を足す場合は、fixed の shout/beat/melody を 0 にしてあるので broachShout への影響はない。broach_type や条件フィールドの必須値で例外が出る場合は `fetchFixedBroachsJson.ts` の FixedBroach 型定義を確認して最小限のフィールドを足す。

- [ ] **Step 3: 実装 — types.ts / teamBuilder.ts / deckState.ts**

`types.ts` ComputedTeam へ追加:

```typescript
export interface ComputedTeam {
  Shout: number;
  Beat: number;
  Melody: number;
  cards: DeckCard[];
  songDuration: number;
  rawShout: number;
  rawBeat: number;
  rawMelody: number;
  broachShout: number;
  broachBeat: number;
  broachMelody: number;
  broachScoreBonus: number;
  /** センタースキルによる加算内訳（センター分。対象属性のみ非ゼロ） */
  centerShout: number;
  centerBeat: number;
  centerMelody: number;
  /** センタースキルによる加算内訳（フレンド分。対象属性のみ非ゼロ） */
  friendShout: number;
  friendBeat: number;
  friendMelody: number;
}
```

`teamBuilder.ts`:
1. `import { broachCapacity } from './broachAssignment';` を追加
2. computeTeam の共有ブローチ加算（line 164-182）を容量適用に変更:

```typescript
    // 共有ブローチ加算（容量ルール適用: 非 UR=0 / 固有持ち UR=1 / それ以外 UR=2。ADR 0039）
    if (sharedBroachSelections?.[i]) {
      const capacity = broachCapacity(card, c => allBroachs.some(br => br.card_id === c.cardID));
      for (const sbId of sharedBroachSelections[i].slice(0, capacity)) {
        if (!sbId) continue;
        const sb = SHARED_BROACHS.find(s => s.id === sbId);
        if (!sb) continue;
        if (sb.targetAttribute) {
          // 条件付き: 対象属性のカード枚数 × ブローチ値を装着カードに加算
          const count = attrCounts[sb.targetAttribute] || 0;
          bShout += sb.shout * count;
          bBeat += sb.beat * count;
          bMelody += sb.melody * count;
        } else {
          bShout += sb.shout;
          bBeat += sb.beat;
          bMelody += sb.melody;
        }
      }
    }
```

3. return へ内訳を追加（centerShout 等は line 217-222 で計算済みの変数をそのまま返す）:

```typescript
  return {
    Shout: teamShout,
    Beat: teamBeat,
    Melody: teamMelody,
    cards,
    songDuration: song.duration || 0,
    rawShout, rawBeat, rawMelody,
    broachShout: broachShoutTotal,
    broachBeat: broachBeatTotal,
    broachMelody: broachMelodyTotal,
    broachScoreBonus,
    centerShout, centerBeat, centerMelody,
    friendShout, friendBeat, friendMelody,
  };
```

`deckState.ts` clampSharedBroachs を委譲に変更:

```typescript
import { broachCapacity } from './broachAssignment';

/** 共有ブローチ装備数の検証・切り詰め。容量ルールは broachCapacity に一本化 (ADR 0039) */
export function clampSharedBroachs(state: DeckState, slotIndex: number, allBroachs: FixedBroach[]): void {
  const card = state.cards[slotIndex];
  const cap = broachCapacity(card, c => allBroachs.some(br => br.card_id === c.cardID));
  state.sharedBroachs[slotIndex] = cap > 0 ? state.sharedBroachs[slotIndex].slice(0, cap) : [];
}
```

- [ ] **Step 4: テスト確認**

Run: `npx vitest run tests/unit/score/sharedBroachCapacity.test.ts && npm run test:unit`
Expected: 全パス。Task 2 の `makeTeam` に center/friend フィールドの追加が必要になったら（型エラー）`expectedInvariants.test.ts` を更新する

- [ ] **Step 5: deckSkillDistribution.ts のセンタースキル再計算を除去**

line 40-56 の `baseByAttr` / `getCenterSkillRate` による再計算を削除し、team のフィールドを使う:

```typescript
  // computeTeam の内訳をそのまま使う (ADR 0039): 対象属性のみ非ゼロなので合計してよい
  const centerBonus = team.centerShout + team.centerBeat + team.centerMelody;
  const friendBonus = team.friendShout + team.friendBeat + team.friendMelody;
```

`getCenterSkillRate` の import と `center` / `friend` / `baseByAttr` 変数が不要になるので削除する（`center`/`friend` は centerBonus 算出にのみ使われていた場合）。

Run: `npm run test:unit`
Expected: 全パス（deckSkillDistribution のテストは同値のため不変）

- [ ] **Step 6: CardDetailTable.svelte を computeTeam 消費へリファクタ**

`$derived.by` 内（line 43-188）の手計算を全て computeTeam に置き換える。表示専用の派生（アシスト行・1 ノーツ値）はチーム合計から算出する:

```typescript
  import { computeTeam } from '../../lib/score/engine';
  // 以下の import は不要になるため削除:
  // resolveDeckBroachs, getCenterSkillRate, EVENT_BONUS_MULTIPLIER, TRAIN_BONUS, SHARED_BROACHS

  const detail = $derived.by(() => {
    const filledCards = deckState.cards.filter(c => c !== null);
    if (filledCards.length === 0) return null;

    const dummySong = (selectedSong || { song_name: '' }) as Song;
    const team = computeTeam(
      deckState.cards, allBroachs, dummySong, deckState.bonusTiers, deckState.trained,
      undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes(),
    );

    const rows: DetailRow[] = [];
    for (const i of DISPLAY_ORDER) {
      const card = deckState.cards[i];
      const dc = team.cards.find(c => c.slotIndex === i);
      if (!card || !dc) continue;
      const sl = getApSkillLevel(card, deckState.skillLevels[i]);
      const tier = deckState.bonusTiers[i];
      const trained = deckState.trained[i];
      rows.push({
        i,
        slotClass: i === 0 ? 'text-indigo-600 font-bold' : i === 5 ? 'text-amber-600 font-bold' : 'text-gray-500',
        cardname: card.cardname || '',
        name: card.name || '',
        trainedLabel: trained ? '済' : '未',
        trainedClass: trained ? 'text-indigo-600 font-bold' : 'text-gray-400',
        bonusLabel: BONUS_LABEL[tier],
        bonusClass: BONUS_CLASS[tier],
        statShout: dc.shout_max,
        statBeat: dc.beat_max,
        statMelody: dc.melody_max,
        bS: dc.broachShout,
        bB: dc.broachBeat,
        bM: dc.broachMelody,
        skillType: card.ap_skill_type || '-',
        skillEffect: formatSkillEffect(card.ap_skill_type, card.ap_skill_req, sl),
      });
    }

    const csShout = team.centerShout + team.friendShout;
    const csBeat = team.centerBeat + team.friendBeat;
    const csMelody = team.centerMelody + team.friendMelody;
    const centerCard = deckState.cards[0];
    const friendCard = deckState.cards[5];
    const centerRate = centerCard ? getCenterSkillRate(centerCard.rarity) : 0;
    const friendRate = friendCard ? getCenterSkillRate(friendCard.rarity) : 0;

    const teamShout = team.Shout;
    const teamBeat = team.Beat;
    const teamMelody = team.Melody;
    const assistShout = scoreUpAssist ? Math.floor(teamShout * (1 + SCOREUP_ASSIST_RATE)) - teamShout : 0;
    const assistBeat = scoreUpAssist ? Math.floor(teamBeat * (1 + SCOREUP_ASSIST_RATE)) - teamBeat : 0;
    const assistMelody = scoreUpAssist ? Math.floor(teamMelody * (1 + SCOREUP_ASSIST_RATE)) - teamMelody : 0;
    const assistPct = Math.round(SCOREUP_ASSIST_RATE * 100);

    const deckShout  = teamShout  + assistShout;
    const deckBeat   = teamBeat   + assistBeat;
    const deckMelody = teamMelody + assistMelody;

    const noteShoutWhite  = Math.floor(deckShout  * NOTE_RATE.white);
    const noteBeatWhite   = Math.floor(deckBeat   * NOTE_RATE.white);
    const noteMelodyWhite = Math.floor(deckMelody * NOTE_RATE.white);
    const noteShoutColor  = Math.floor(deckShout  * NOTE_RATE.color);
    const noteBeatColor   = Math.floor(deckBeat   * NOTE_RATE.color);
    const noteMelodyColor = Math.floor(deckMelody * NOTE_RATE.color);

    return {
      rows,
      foot: {
        totalShout: team.rawShout, totalBeat: team.rawBeat, totalMelody: team.rawMelody,
        totalBS: team.broachShout, totalBB: team.broachBeat, totalBM: team.broachMelody,
        hasBroachRow: (team.broachShout + team.broachBeat + team.broachMelody) > 0,
        hasCenter: !!centerCard && centerRate > 0,
        hasFriend: !!friendCard && friendRate > 0,
        centerRate, friendRate,
        centerShout: team.centerShout, centerBeat: team.centerBeat, centerMelody: team.centerMelody,
        friendShout: team.friendShout, friendBeat: team.friendBeat, friendMelody: team.friendMelody,
        scoreUpAssist,
        assistPct, assistShout, assistBeat, assistMelody,
        deckShout, deckBeat, deckMelody,
        noteShoutWhite, noteBeatWhite, noteMelodyWhite,
        noteShoutColor, noteBeatColor, noteMelodyColor,
      },
    };
  });
```

`getCenterSkillRate` の import は残す（レート表示に使用）。テンプレート（HTML 部分）は変更不要（foot のキー名を維持しているため）。

注意: 従来はローカルの UR ガードで非 UR の共有ブローチを表示から除外していたが、これは engine の容量ルール（Step 3）に吸収される — 挙動同一。

- [ ] **Step 7: 型チェック・全体テスト・コミット**

Run: `npm run test:unit && npx astro check 2>&1 | tail -5`
Expected: 全パス、新規型エラーなし

```bash
git add src/lib/score/types.ts src/lib/score/teamBuilder.ts src/lib/score/deckState.ts src/lib/score/deckSkillDistribution.ts src/components/score/CardDetailTable.svelte tests/unit/score/sharedBroachCapacity.test.ts tests/unit/score/expectedInvariants.test.ts
git commit -m "refactor: 共有ブローチ容量ルールを一本化し衣装詳細テーブルを computeTeam 出力に統一 (ADR 0039)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: spec 文書更新・実機確認・リリースノート

**Files:**
- Modify: `docs/shrink-skill-spec.md`（§5-3 / §5-4 / §7-10）
- Modify: `docs/score_calc_spec.md`（per クランプ・判定ガード/スコアダウン除外の追記）
- Modify: `docs/superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md`（M3 の記述訂正）
- Modify: `src/pages/releases/index.astro`（リリースノート）

- [ ] **Step 1: shrink-skill-spec.md の更新**

- §5-3（期待値式）: 「デッキ内縮小 rate の最大値」を「スキルごとの (rateᵢ−1) 加重和」へ書き換え、ADR 0036 を参照
- §5-4: effectiveRate の記述を rate 加重の説明へ更新
- §7-10: 「UI は Lv 一括選択なので rate 混在は起きない」の記述を削除し、「Lv5 データ欠落時のフォールバックで rate 混在は常態のため rate 加重で対処 (ADR 0036)」へ差し替え
- 期待カバー秒の構造キャップ（capSeconds）を §5-3 に追記

- [ ] **Step 2: score_calc_spec.md の更新**

- スキル解析の節に「判定ガード(MISS→Perfect) / 判定拡大スコアダウンはスキルなし扱い (ADR 0037)」を追記
- 「発動率 per は [0,100] にクランプ (ADR 0037)」を追記

- [ ] **Step 3: design spec の訂正**

`docs/superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md` の M3 節「受け側は既に対応済みで変更不要」を「受け側 (`ScoreCalc.svelte`) にも `scoreUpAssist` の保存・復元を追加する（`badgeRate` は既存）」へ訂正する（実装調査で assist が未永続化と判明したため）。

- [ ] **Step 4: dev サーバーで実機確認**

```bash
npm run dev  # run_in_background: true で起動、"ready in" を待つ
```

Playwright / chrome-devtools MCP で以下を確認し、スクリーンショットを `tmp/` に保存:
1. `http://localhost:4321/score-calc/` — 縮小スキル入りデッキで期待値 ≤ 理論値、スキル発動タブの発動回数、衣装詳細テーブルの数値がリファクタ前と同一
2. `http://localhost:4321/score-calc/max-score-finder/` — 探索実行 → 「スコア計算で開く」→ アシスト/バッジが引き継がれてスコアが一致
3. `http://localhost:4321/cards/`（比較タブ）— 表示が崩れていないこと

- [ ] **Step 5: リリースノート更新**

`src/pages/releases/index.astro` の形式に合わせて次の項目を追加:
- スコア計算: 期待値が理論値を上回ることがある問題を修正（縮小スキルの倍率混在・発動率データ異常・カバー率飽和時）
- スコア計算: 判定ガード・判定拡大スコアダウンのスキルが誤ってスコアに加算されていた問題を修正
- スコア計算: シミュレーションの乱数品質を改善
- スコア計算: スキル発動回数の表示を実際のシミュレーション挙動と統一
- 編成組合計算: 「スコア計算で開く」で ScoreUP アシスト・バッジ設定が引き継がれるように修正

- [ ] **Step 6: 最終テストとコミット**

```bash
npm run test:unit
git add docs/shrink-skill-spec.md docs/score_calc_spec.md docs/superpowers/specs/2026-07-02-score-engine-audit-fixes-design.md src/pages/releases/index.astro
git commit -m "docs: 監査修正に伴う spec 文書更新とリリースノート追記

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [ ] **Step 7: PR 作成**

```bash
git push -u origin fix/score-engine-audit
gh pr create --title "fix: スコア計算エンジン監査（深刻度 高・中）の修正" --body "..."
```

PR 本文には監査レポートへの参照・ADR 0036〜0039・修正一覧・テスト結果を記載し、末尾に `🤖 Generated with [Claude Code](https://claude.com/claude-code)` を付ける。
