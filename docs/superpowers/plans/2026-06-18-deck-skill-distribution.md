# デッキ編成画面 各衣装スキル上乗せ分布 実装プラン

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** スコア計算（デッキ編成）画面の各衣装詳細テーブルとシミュレーション結果の間に、現在の編成での各衣装のスキル上乗せ分布チャート（凡例に実効属性値・貢献比率を併記）を追加する。

**Architecture:** 計算はデッキ非依存の純粋関数 `deckSkillDistribution.ts` に切り出し（`binomialPmf` / `calcCardSkillMaxActivations` / `getCenterSkillRate` を再利用）、描画は静的 Svelte コンポーネント `DeckSkillDistribution.svelte` で行い、`ScoreCalc.svelte` に差し込む。

**Tech Stack:** Astro 6 / Svelte 5（runes: `$props` / `$derived` / `$derived.by`）/ TypeScript / Vitest / Playwright / Tailwind CSS v4

## Global Constraints

- ライトテーマ固定。`dark:` バリアントは付けない（ADR 0020）。
- ユーザー可視テキストは「カード」でなく **「衣装」**。内部識別子は `card` のまま。
- カードを指す ID は **`Card.ID`**（`DeckCard.cardId`）。画像 URL は `cardThumbUrl(...)`（`src/lib/ui.ts`）を使い文字列直書きしない。
- スロット index: 0=センター, 1-4=メンバー, 5=フレンド。表示順は `DISPLAY_ORDER`（`src/lib/score/deckState.ts`）。
- 新しい計算式を二重定義せず、`teamBuilder.ts` / `simulation.ts` の既存ロジックを再利用する。
- 設計の根拠は ADR 0025 / `docs/superpowers/specs/2026-06-18-deck-skill-distribution-design.md`。
- リリースノートページ（`src/pages/releases/index.astro`）は git タグ/コミットから自動生成。手動編集は不要。コミットメッセージを意味のある日本語で書く。
- 日常検証は `npm run dev`（HMR、約1秒起動）。E2E はローカルでは dev サーバーを先に起動して再利用（`reuseExistingServer`）。

## File Structure

- Create: `src/lib/score/deckSkillDistribution.ts` — デッキ文脈の各衣装スキル分布エントリを生成する純粋関数。
- Create: `tests/unit/score/deckSkillDistribution.test.ts` — 上記の Vitest 単体テスト。
- Create: `src/components/score/DeckSkillDistribution.svelte` — 静的密度曲線チャート＋凡例（実効属性値・貢献比率）。
- Modify: `src/components/ScoreCalc.svelte` — `CardDetailTable` と `ScoreCalcResults` の間に新セクションを差し込む。
- Modify: `tests/score-calc-spec.test.ts` または新規 `tests/score-calc-distribution.test.ts` — セクション表示の E2E。

---

### Task 1: 純粋計算モジュール `deckSkillDistribution.ts`

**Files:**
- Create: `src/lib/score/deckSkillDistribution.ts`
- Test: `tests/unit/score/deckSkillDistribution.test.ts`

**Interfaces:**
- Consumes:
  - `binomialPmf(n: number, p: number): number[]` — `src/lib/score/cardDistribution.ts`
  - `calcCardSkillMaxActivations(team: ComputedTeam, notesCount: number, slotIndex: number): number` — `src/lib/score/simulation.ts`
  - `getCenterSkillRate(rarity: string | null): number` — `src/lib/score/teamBuilder.ts`
  - `SCOREUP_ASSIST_RATE: number`（= 0.2） — `src/lib/score/constants.ts`
  - `cardThumbUrl(id: number): string` — `src/lib/ui.ts`
  - `DISPLAY_ORDER: number[]` — `src/lib/score/deckState.ts`
  - 型 `ComputedTeam` / `DeckCard`（`DeckCard` は `slotIndex` / `cardId` / `cardname` / `rarity` / `attribute`('Shout'|'Beat'|'Melody') / `shout_max` / `beat_max` / `melody_max` / `broachShout` / `broachBeat` / `broachMelody` / `skill`(CardSkill|null) を持つ。`CardSkill` は `per` / `value` / `count` / `isShrink` を持つ）— `src/lib/score/types.ts`。`ComputedTeam` は `Shout`/`Beat`/`Melody`（チーム合計属性値）/ `cards: DeckCard[]` / `rawShout`/`rawBeat`/`rawMelody` / `broachShout`/`broachBeat`/`broachMelody` / `songDuration` を持つ。
- Produces:
  - `interface DeckSkillDistEntry { slotIndex: number; cardName: string; thumbUrl: string; color: string; skillGroup: 'scoreUp' | 'shrink' | 'none'; n: number; p: number; value: number; points: { x: number; prob: number }[]; effectiveAppeal: number; contribRatio: number; }`
  - `function buildDeckSkillDistribution(team: ComputedTeam, notesCount: number, options: { scoreUpAssist: boolean; scoreUpBadgeRate: number }): DeckSkillDistEntry[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/score/deckSkillDistribution.test.ts` を作成:

```ts
import { describe, it, expect } from 'vitest';
import { buildDeckSkillDistribution } from '../../../src/lib/score/deckSkillDistribution';
import type { ComputedTeam, DeckCard, CardSkill } from '../../../src/lib/score/types';

function skill(partial: Partial<CardSkill>): CardSkill {
  return {
    cardIndex: 0,
    skillType: 'scoreUp',
    originalType: '',
    count: 10,
    per: 50,
    value: 1000,
    rate: 0,
    isTimer: false,
    isShrink: false,
    spTime: 0,
    ...partial,
  };
}

function card(partial: Partial<DeckCard>): DeckCard {
  return {
    cardId: 1,
    cardID: 1,
    cardname: 'テスト衣装',
    name: 'キャラ',
    rarity: 'UR',
    attribute: 'Shout',
    shout_max: 1000,
    beat_max: 0,
    melody_max: 0,
    skill: null,
    broachShout: 0,
    broachBeat: 0,
    broachMelody: 0,
    slotIndex: 1,
    bonusMultiplier: 1,
  } as DeckCard;
}

/** センター/フレンドを持たない（slot 1-4 のみ）メンバーのみチームを作る */
function membersTeam(cards: DeckCard[]): ComputedTeam {
  const rawShout = cards.reduce((s, c) => s + c.shout_max, 0);
  const rawBeat = cards.reduce((s, c) => s + c.beat_max, 0);
  const rawMelody = cards.reduce((s, c) => s + c.melody_max, 0);
  const broachShout = cards.reduce((s, c) => s + c.broachShout, 0);
  const broachBeat = cards.reduce((s, c) => s + c.broachBeat, 0);
  const broachMelody = cards.reduce((s, c) => s + c.broachMelody, 0);
  return {
    Shout: rawShout + broachShout,
    Beat: rawBeat + broachBeat,
    Melody: rawMelody + broachMelody,
    cards,
    songDuration: 120,
    rawShout, rawBeat, rawMelody,
    broachShout, broachBeat, broachMelody,
    broachScoreBonus: 0,
  } as ComputedTeam;
}

const NO_OPT = { scoreUpAssist: false, scoreUpBadgeRate: 0 };

describe('buildDeckSkillDistribution', () => {
  it('scoreUp 衣装の分布点の確率総和は 1、skillGroup は scoreUp', () => {
    const team = membersTeam([card({ slotIndex: 1, skill: skill({ count: 10, per: 50, value: 1000 }) })]);
    const [e] = buildDeckSkillDistribution(team, 100, NO_OPT); // n = floor(100/10) = 10
    expect(e.skillGroup).toBe('scoreUp');
    expect(e.n).toBe(10);
    expect(e.p).toBeCloseTo(0.5);
    const sum = e.points.reduce((s, pt) => s + pt.prob, 0);
    expect(sum).toBeCloseTo(1, 6);
    expect(e.points[0].x).toBe(0);
    expect(e.points[e.points.length - 1].x).toBe(10 * 1000);
  });

  it('貢献比率の総和は 1', () => {
    const team = membersTeam([
      card({ slotIndex: 1, shout_max: 1000 }),
      card({ slotIndex: 2, shout_max: 3000 }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    const sum = entries.reduce((s, e) => s + e.contribRatio, 0);
    expect(sum).toBeCloseTo(1, 6);
    const map = new Map(entries.map(e => [e.slotIndex, e.contribRatio]));
    expect(map.get(1)).toBeCloseTo(0.25, 6);
    expect(map.get(2)).toBeCloseTo(0.75, 6);
  });

  it('係数なしのとき実効属性値の合計はチーム合計属性値に一致', () => {
    const team = membersTeam([
      card({ slotIndex: 1, shout_max: 1000, broachShout: 200 }),
      card({ slotIndex: 2, beat_max: 1500 }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    const total = entries.reduce((s, e) => s + e.effectiveAppeal, 0);
    expect(total).toBe(team.Shout + team.Beat + team.Melody);
  });

  it('スキルなし/判定補助系は skillGroup=none で 0 起点の単一スパイク', () => {
    const team = membersTeam([card({ slotIndex: 1, skill: null })]);
    const [e] = buildDeckSkillDistribution(team, 100, NO_OPT);
    expect(e.skillGroup).toBe('none');
    expect(e.points).toEqual([{ x: 0, prob: 1 }]);
  });

  it('スコアアップ系と縮小系が混在すると group が分かれる', () => {
    const team = membersTeam([
      card({ slotIndex: 1, skill: skill({ isShrink: false, value: 1000 }) }),
      card({ slotIndex: 2, skill: skill({ isShrink: true, value: 2 }) }),
    ]);
    const entries = buildDeckSkillDistribution(team, 100, NO_OPT);
    expect(entries.find(e => e.slotIndex === 1)!.skillGroup).toBe('scoreUp');
    expect(entries.find(e => e.slotIndex === 2)!.skillGroup).toBe('shrink');
  });

  it('アシスト/バッジは実効属性値を倍率で底上げするが貢献比率は不変', () => {
    const cards = [
      card({ slotIndex: 1, shout_max: 1000 }),
      card({ slotIndex: 2, shout_max: 1000 }),
    ];
    const team = membersTeam(cards);
    const base = buildDeckSkillDistribution(team, 100, NO_OPT);
    const boosted = buildDeckSkillDistribution(team, 100, { scoreUpAssist: true, scoreUpBadgeRate: 16 });
    // 比率は不変
    expect(boosted[0].contribRatio).toBeCloseTo(base[0].contribRatio, 6);
    // 実効属性値は 1.2 × 1.16 倍
    expect(boosted[0].effectiveAppeal).toBe(Math.round(base[0].effectiveAppeal * 1.2 * 1.16));
  });
});
```

- [ ] **Step 2: テストを実行して失敗を確認**

Run: `npm run test:unit -- deckSkillDistribution`
Expected: FAIL（`buildDeckSkillDistribution` が存在しない: モジュール解決エラー）

- [ ] **Step 3: モジュールを実装**

`src/lib/score/deckSkillDistribution.ts` を作成:

```ts
/**
 * スコア計算（デッキ編成）画面用: 現在の編成での各衣装のスキル上乗せ分布。
 *
 * - スキル発動成功回数 K は二項分布 Binomial(n, p)（n=選択曲での最大発動回数, p=発動率）。
 * - 横軸は 0 起点の「スキル上乗せ分」（スコアアップ=スコア / 縮小=カバー秒数）。チーム土台は曲線に含めない。
 * - 凡例併記用の実効属性値は特訓・特効・ブローチ・ラビット・センタースキル・ScoreUpアシスト/バッジまで
 *   シミュレーションと同じ掛け方で反映する（センタースキル分はセンター/フレンドカードに計上）。
 * 設計: docs/superpowers/specs/2026-06-18-deck-skill-distribution-design.md / ADR 0025
 */
import type { ComputedTeam } from './types';
import { binomialPmf } from './cardDistribution';
import { calcCardSkillMaxActivations } from './simulation';
import { getCenterSkillRate } from './teamBuilder';
import { SCOREUP_ASSIST_RATE } from './constants';
import { cardThumbUrl } from '../ui';
import { DISPLAY_ORDER } from './deckState';

export interface DeckSkillDistEntry {
  slotIndex: number;
  cardName: string;
  thumbUrl: string;
  color: string;
  skillGroup: 'scoreUp' | 'shrink' | 'none';
  n: number;
  p: number;
  value: number;
  points: { x: number; prob: number }[];
  effectiveAppeal: number;
  contribRatio: number;
}

// 属性色と衝突しない固定シリーズ6色（DISPLAY_ORDER の位置に対応）
const SERIES_COLORS = ['#ea580c', '#0891b2', '#7c3aed', '#16a34a', '#db2777', '#ca8a04'];

export function buildDeckSkillDistribution(
  team: ComputedTeam,
  notesCount: number,
  options: { scoreUpAssist: boolean; scoreUpBadgeRate: number },
): DeckSkillDistEntry[] {
  const center = team.cards.find(c => c.slotIndex === 0) ?? null;
  const friend = team.cards.find(c => c.slotIndex === 5) ?? null;

  // computeTeam と同じ算出: センタースキル分は (raw+broach) のチーム合計 × rate で、対象属性のみ加算
  const baseByAttr = (attr: 'Shout' | 'Beat' | 'Melody'): number =>
    attr === 'Shout'
      ? team.rawShout + team.broachShout
      : attr === 'Beat'
        ? team.rawBeat + team.broachBeat
        : team.rawMelody + team.broachMelody;

  const centerBonus = center
    ? Math.floor(baseByAttr(center.attribute) * getCenterSkillRate(center.rarity) / 100)
    : 0;
  const friendBonus = friend
    ? Math.floor(baseByAttr(friend.attribute) * getCenterSkillRate(friend.rarity) / 100)
    : 0;

  const assistFactor = options.scoreUpAssist ? 1 + SCOREUP_ASSIST_RATE : 1;
  const badgeFactor = options.scoreUpBadgeRate > 0 ? 1 + options.scoreUpBadgeRate / 100 : 1;

  // 補正前（全体係数を掛ける前）の有効属性値ベースをスロットごとに算出
  const baseAppeal = new Map<number, number>();
  for (const dc of team.cards) {
    let a = dc.shout_max + dc.beat_max + dc.melody_max + dc.broachShout + dc.broachBeat + dc.broachMelody;
    if (dc.slotIndex === 0) a += centerBonus;
    if (dc.slotIndex === 5) a += friendBonus;
    baseAppeal.set(dc.slotIndex, a);
  }
  const totalBase = [...baseAppeal.values()].reduce((s, v) => s + v, 0);

  const entries: DeckSkillDistEntry[] = [];
  for (const slotIndex of DISPLAY_ORDER) {
    const dc = team.cards.find(c => c.slotIndex === slotIndex);
    if (!dc) continue;

    const colorIdx = DISPLAY_ORDER.indexOf(slotIndex);
    const color = SERIES_COLORS[colorIdx % SERIES_COLORS.length];
    const base = baseAppeal.get(slotIndex) ?? 0;
    const effectiveAppeal = Math.round(base * assistFactor * badgeFactor);
    const contribRatio = totalBase > 0 ? base / totalBase : 0;

    let skillGroup: 'scoreUp' | 'shrink' | 'none' = 'none';
    let n = 0;
    let p = 0;
    let value = 0;
    let points: { x: number; prob: number }[] = [{ x: 0, prob: 1 }];

    const skill = dc.skill;
    if (skill) {
      skillGroup = skill.isShrink ? 'shrink' : 'scoreUp';
      n = calcCardSkillMaxActivations(team, notesCount, slotIndex);
      p = skill.per / 100;
      value = skill.value;
      if (n > 0 && value > 0) {
        const pmf = binomialPmf(n, p);
        points = pmf.map((prob, k) => ({ x: k * value, prob }));
      }
    }

    entries.push({
      slotIndex,
      cardName: dc.cardname,
      thumbUrl: cardThumbUrl(dc.cardId),
      color,
      skillGroup,
      n,
      p,
      value,
      points,
      effectiveAppeal,
      contribRatio,
    });
  }
  return entries;
}
```

- [ ] **Step 4: テストを実行して成功を確認**

Run: `npm run test:unit -- deckSkillDistribution`
Expected: PASS（6 テストすべて green）

- [ ] **Step 5: コミット**

```bash
git add src/lib/score/deckSkillDistribution.ts tests/unit/score/deckSkillDistribution.test.ts
git commit -m "feat: デッキ文脈の各衣装スキル分布計算 deckSkillDistribution を追加 (ADR 0025)"
```

---

### Task 2: 描画コンポーネント `DeckSkillDistribution.svelte` と画面差し込み

**Files:**
- Create: `src/components/score/DeckSkillDistribution.svelte`
- Modify: `src/components/ScoreCalc.svelte`（`CardDetailTable` と `ScoreCalcResults` の間）

**Interfaces:**
- Consumes:
  - `buildDeckSkillDistribution(team, notesCount, options)` / `DeckSkillDistEntry`（Task 1）
  - `computeTeam` / `computeShrinkExclusion` / `computeGroupSizes` / `flattenNotes` — `src/lib/score/engine.ts`
  - `loadRabbitNotes()` — `src/lib/data/rabbitNote.ts`
- Produces: Svelte コンポーネント `DeckSkillDistribution`（props: `deckState` / `selectedSong` / `allBroachs` / `scoreUpAssist` / `scoreUpBadgeRate`）

- [ ] **Step 1: コンポーネントを作成**

`src/components/score/DeckSkillDistribution.svelte` を作成:

```svelte
<script lang="ts">
  import type { Song } from '../../lib/data/fetchSongsJson';
  import type { FixedBroach } from '../../lib/data/fetchFixedBroachsJson';
  import type { DeckState } from '../../lib/score/deckState';
  import {
    computeTeam,
    computeShrinkExclusion,
    computeGroupSizes,
    flattenNotes,
  } from '../../lib/score/engine';
  import { loadRabbitNotes } from '../../lib/data/rabbitNote';
  import { buildDeckSkillDistribution, type DeckSkillDistEntry } from '../../lib/score/deckSkillDistribution';

  let { deckState, selectedSong, allBroachs, scoreUpAssist, scoreUpBadgeRate }: {
    deckState: DeckState;
    selectedSong: Song | null;
    allBroachs: FixedBroach[];
    scoreUpAssist: boolean;
    scoreUpBadgeRate: number;
  } = $props();

  const entries = $derived.by((): DeckSkillDistEntry[] => {
    const filled = deckState.cards.filter(c => c !== null).length;
    if (!selectedSong || filled === 0) return [];
    const team = computeTeam(
      deckState.cards, allBroachs, selectedSong, deckState.bonusTiers, deckState.trained,
      undefined, deckState.sharedBroachs, deckState.skillLevels, loadRabbitNotes(),
    );
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(selectedSong));
    const notes = flattenNotes(selectedSong, 42, exclusion);
    return buildDeckSkillDistribution(team, notes.length, {
      scoreUpAssist,
      scoreUpBadgeRate: Number(scoreUpBadgeRate) || 0,
    });
  });

  type Panel = { metric: 'score' | 'cover'; curves: DeckSkillDistEntry[]; legendOnly: DeckSkillDistEntry[] };

  const panels = $derived.by((): Panel[] => {
    const sc = entries.filter(e => e.skillGroup === 'scoreUp');
    const sh = entries.filter(e => e.skillGroup === 'shrink');
    const nn = entries.filter(e => e.skillGroup === 'none');
    const out: Panel[] = [];
    if (sc.length) out.push({ metric: 'score', curves: sc, legendOnly: [] });
    if (sh.length) out.push({ metric: 'cover', curves: sh, legendOnly: [] });
    if (out.length) {
      out[0].legendOnly = nn; // none は最初のパネル凡例にだけ載せる（曲線なし）
    } else if (nn.length) {
      out.push({ metric: 'score', curves: [], legendOnly: nn });
    }
    return out;
  });

  const W = 360, H = 110, PAD_L = 8, PAD_R = 8, PAD_T = 8, PAD_B = 18;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  function formatX(metric: 'score' | 'cover', v: number): string {
    return metric === 'cover' ? `${v.toFixed(1)}秒` : Math.round(v).toLocaleString();
  }

  function domainMax(curves: DeckSkillDistEntry[]): number {
    let hi = 0;
    for (const e of curves) {
      const last = e.points[e.points.length - 1];
      if (last && last.x > hi) hi = last.x;
    }
    return hi > 0 ? hi : 1;
  }

  // ピーク正規化した密度ポリラインの points 属性文字列
  function polyline(e: DeckSkillDistEntry, hi: number): string {
    const peak = Math.max(...e.points.map(pt => pt.prob), 1e-9);
    return e.points
      .map(pt => {
        const px = PAD_L + (pt.x / hi) * innerW;
        const py = PAD_T + innerH - (pt.prob / peak) * innerH;
        return `${px.toFixed(1)},${py.toFixed(1)}`;
      })
      .join(' ');
  }
</script>

{#if panels.length > 0}
  <section class="bg-white rounded-lg shadow p-4 mb-4">
    <h2 class="text-sm font-bold text-gray-700 mb-1">スキル上乗せ分布</h2>
    <p class="text-[11px] text-gray-500 mb-3">
      現在の編成での各衣装のスキル発動による上乗せ分布（横軸は0起点の上乗せ{panels.some(p => p.metric === 'cover') ? 'スコア／カバー秒数' : 'スコア'}）。
    </p>
    <div class="flex flex-col gap-4">
      {#each panels as panel (panel.metric)}
        {@const hi = domainMax(panel.curves)}
        <div>
          {#if panel.curves.length > 0}
            <div class="text-[11px] text-gray-500 mb-1">
              {panel.metric === 'cover' ? 'カバー秒数' : '上乗せスコア'}
            </div>
            <svg viewBox="0 0 {W} {H}" class="w-full max-w-[420px]" role="img" aria-label="スキル上乗せ分布">
              <line x1={PAD_L} y1={PAD_T + innerH} x2={W - PAD_R} y2={PAD_T + innerH} stroke="var(--chart-axis-label)" stroke-width="0.5" />
              {#each panel.curves as e (e.slotIndex)}
                {#if e.points.length > 1}
                  <polyline points={polyline(e, hi)} fill="none" stroke={e.color} stroke-width="1.5" />
                {:else}
                  <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={PAD_T + innerH} stroke={e.color} stroke-width="1.5" />
                {/if}
              {/each}
              <text x={PAD_L} y={H - 4} font-size="9" fill="var(--chart-text)">0</text>
              <text x={W - PAD_R} y={H - 4} font-size="9" text-anchor="end" fill="var(--chart-text)">{formatX(panel.metric, hi)}</text>
            </svg>
          {/if}
          <ul class="mt-2 flex flex-col gap-1">
            {#each [...panel.curves, ...panel.legendOnly] as e (e.slotIndex)}
              <li class="flex items-center gap-2 text-[11px] text-gray-700">
                <span class="inline-block w-3 h-3 rounded-sm flex-shrink-0" style="background:{e.color}"></span>
                <img src={e.thumbUrl} alt="" width="20" height="20" class="rounded flex-shrink-0" loading="lazy" />
                <span class="truncate max-w-[10rem]">{e.cardName}</span>
                <span class="ml-auto tabular-nums text-gray-500">属性値 {e.effectiveAppeal.toLocaleString()}</span>
                <span class="tabular-nums text-gray-500">貢献 {(e.contribRatio * 100).toFixed(1)}%</span>
              </li>
            {/each}
          </ul>
        </div>
      {/each}
    </div>
  </section>
{/if}
```

- [ ] **Step 2: `ScoreCalc.svelte` に import を追加**

`src/components/ScoreCalc.svelte` の import ブロック（23 行目 `import BroachRankingChart ...` の直後）に追加:

```ts
  import DeckSkillDistribution from './score/DeckSkillDistribution.svelte';
```

- [ ] **Step 3: `ScoreCalc.svelte` にセクションを差し込む**

`src/components/ScoreCalc.svelte` の `<CardDetailTable ... />`（383 行付近）と `<ScoreCalcResults ... />`（385 行付近）の **間** に追加:

```svelte
    <DeckSkillDistribution deckState={deckState} selectedSong={selectedSong} allBroachs={allBroachsState} scoreUpAssist={scoreUpAssist} scoreUpBadgeRate={scoreUpBadgeRate} />
```

> 注: `allBroachsState` / `scoreUpAssist` / `scoreUpBadgeRate` は `ScoreCalcResults` へ既に渡している同名の変数。`ScoreCalcResults` の props と同じ値を渡す。

- [ ] **Step 4: dev サーバーで表示を確認**

```bash
npm run dev
```

ready ログ（`ready in` 出力）を待ち、Playwright/chrome-devtools MCP で `http://localhost:4321/score-calc/` を開く。
手順:
1. 楽曲を選択し、衣装を 2〜3 枚デッキに入れる（スコアアップ系と縮小系を1枚ずつ含めると2チャート分割を確認できる）。
2. 各衣装詳細テーブルとシミュレーション結果の **間** に「スキル上乗せ分布」セクションが表示され、密度曲線・凡例（衣装名／属性値／貢献%）が出ることをスクショで確認。
3. スクショを `tmp/` に保存しユーザーに提示。
Expected: 詳細テーブルとシミュ結果の間に新セクションが表示され、曲線と凡例の数値が出る。空デッキ/曲未選択では非表示。

- [ ] **Step 5: 型・ビルド健全性を確認**

Run: `npx astro check`
Expected: 本コンポーネント・`ScoreCalc.svelte` に新規エラーが出ない。

- [ ] **Step 6: コミット**

```bash
git add src/components/score/DeckSkillDistribution.svelte src/components/ScoreCalc.svelte
git commit -m "feat: スコア計算画面に各衣装スキル上乗せ分布チャートを追加 (ADR 0025)"
```

---

### Task 3: E2E（表示確認）

**Files:**
- Create: `tests/score-calc-distribution.test.ts`

**Interfaces:**
- Consumes: 既存 Playwright 設定（`playwright.config.ts`、`reuseExistingServer`）

- [ ] **Step 1: 失敗する（or 未存在の）E2E テストを書く**

`tests/score-calc-distribution.test.ts` を作成。既存 `tests/score-calc-spec.test.ts` のセットアップ（楽曲選択・衣装投入の手順）を参照し、同じ流儀で書く。最小の表示確認:

```ts
import { test, expect } from '@playwright/test';

test('スコア計算画面にスキル上乗せ分布セクションが表示される', async ({ page }) => {
  await page.goto('/score-calc/');
  // 既存 score-calc-spec.test.ts と同じ手順で楽曲選択＋衣装を投入する
  // （CardPickerModal を開いてスコアアップ系の UR を1枚以上デッキに入れる）
  // 投入後、見出しが表示されることを確認
  await expect(page.getByRole('heading', { name: 'スキル上乗せ分布' })).toBeVisible();
});
```

> 実装時の注意（CLAUDE.md）: 裸の `locator('select')` は dev toolbar と衝突するので使わない。`getByRole` / `getByLabel` / `getByTestId` で特定する。楽曲選択・衣装投入の具体操作は `tests/score-calc-spec.test.ts` の既存手順をそのまま流用する。

- [ ] **Step 2: dev サーバーを起動して E2E を実行**

```bash
npm run dev   # 既に起動済みなら不要
npx playwright test tests/score-calc-distribution.test.ts
```

Expected: PASS（4321 の dev サーバーを再利用し、ビルドは走らない）

- [ ] **Step 3: コミット**

```bash
git add tests/score-calc-distribution.test.ts
git commit -m "test: スキル上乗せ分布セクションの表示 E2E を追加"
```

---

## 完了後

- ユーザーにスクショで確認を取る（Task 2 Step 4）。
- 承認後、`feat/deck-skill-distribution` ブランチを push し PR を作成。CI 結果を待たずリリース（タグ push）まで行う。
- リリースタグ push 後、`release-tweet` スキルで告知ツイートを投稿（`.env` があれば自動投稿）。

## Self-Review チェック結果

- **Spec coverage**: 配置（Task 2 Step 3）/ 0起点曲線・PMF（Task 1）/ 2チャート分割（Task 2 panels）/ 実効属性値・センター計上・アシスト/バッジ（Task 1 + テスト）/ 貢献比率数値併記（Task 2 凡例）/ none 退避（Task 1 + panels）/ ガード（Task 2 entries）/ 単体テスト（Task 1）/ E2E（Task 3）/ ADR・spec（コミット済み）をすべてタスクで網羅。
- **Placeholder scan**: TBD/TODO なし。全コードステップに実コードを記載。
- **Type consistency**: `DeckSkillDistEntry` / `buildDeckSkillDistribution` のシグネチャを Task 1 で定義し Task 2 で同名・同型で使用。`computeTeam` 呼び出し引数は `ScoreCalcResults.svelte` の既存呼び出しと一致。
