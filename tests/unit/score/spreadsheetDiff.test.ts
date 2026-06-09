import { describe, it, expect } from 'vitest';
import { goldenCases } from '../../fixtures/golden/loadGolden';
import type { GoldenCase } from '../../fixtures/golden/loadGolden';
import { buildOracleInput } from './helpers/buildOracleInput';
import { runOracle } from '../../oracle/spreadsheetOracle';
import { classify } from '../../oracle/knownDiffs';
import { allCards, findSongById, allBroachs } from '../../fixtures/index';
import type { Card } from '../../../src/lib/data/fetchCardsJson';
import type { EventBonusTier } from '../../../src/lib/data/eventBonusTiers';
import {
  computeTeam,
  calcExpectedScore,
  calcMaxScore,
  flattenNotes,
  computeShrinkExclusion,
  computeGroupSizes,
} from '../../../src/lib/score/engine';

describe('スプレッドシート v1.0.6 オラクル — ①ポート忠実性', () => {
  for (const gc of goldenCases) {
    const input = buildOracleInput(gc);
    if (gc.max) {
      it(`${gc.label}: 属性値スコア (max)`, () => {
        expect(runOracle(input, 'max').attr).toBe(gc.max!.attr);
      });
      it(`${gc.label}: スコアアップ(max)`, () => {
        expect(runOracle(input, 'max').scoreUp).toBe(gc.max!.scoreUp);
      });
      it(`${gc.label}: 縮小スキル(max)`, () => {
        expect(runOracle(input, 'max').shrink).toBe(gc.max!.shrink);
      });
      it(`${gc.label}: ライブ終了時(max)`, () => {
        expect(runOracle(input, 'max').liveEnd).toBe(gc.max!.liveEnd);
      });
      it(`${gc.label}: 最終リザルト(max)`, () => {
        expect(runOracle(input, 'max').final).toBe(gc.max!.final);
      });
    }
    if (gc.expected) {
      it(`${gc.label}: 属性値スコア (expected)`, () => {
        expect(runOracle(input, 'expected').attr).toBe(gc.expected!.attr);
      });
      it(`${gc.label}: スコアアップ(expected)`, () => {
        expect(runOracle(input, 'expected').scoreUp).toBe(gc.expected!.scoreUp);
      });
      it(`${gc.label}: 縮小スキル(expected)`, () => {
        expect(runOracle(input, 'expected').shrink).toBe(gc.expected!.shrink);
      });
      it(`${gc.label}: ライブ終了時(expected)`, () => {
        expect(runOracle(input, 'expected').liveEnd).toBe(gc.expected!.liveEnd);
      });
      it(`${gc.label}: 最終リザルト(expected)`, () => {
        expect(runOracle(input, 'expected').final).toBe(gc.expected!.final);
      });
    }
  }
});

// ---------------------------------------------------------------------------
// ② engine ↔ オラクル(=スプレッドシート) 差分レポート + 分類 + 回帰ガード
// ---------------------------------------------------------------------------

/** master ID 列でカードを引く（ゴールデンのデッキは cardID ではなく ID 列）。 */
function findCardByMasterId(id: number): Card {
  const card = allCards.find((c) => c.ID === id);
  if (!card) throw new Error(`master ID=${id} のカードが fixture に存在しません`);
  return card;
}

/**
 * engine 用にデッキを並べ替える。
 * オラクルは center/friend を明示 index で扱うが、engine は deck[0]=センター /
 * deck[5]=フレンド 固定。center のカードを index0、friend のカードを index5 に置き、
 * 残りは元の並び順を保って中間枠(1..4)へ詰める。
 * bonusTiers も同じ並べ替えを適用する。
 *
 * @returns 並べ替え済みの { deck, bonusTiers, trained, skillLevels }
 */
function reorderForEngine(gc: GoldenCase): {
  deck: Card[];
  bonusTiers: EventBonusTier[];
  trained: boolean[];
  skillLevels: (1 | 2 | 3 | 4 | 5)[];
} {
  const n = gc.deck.length;
  const order: number[] = [];
  order.push(gc.center); // index0 = センター
  for (let i = 0; i < n; i++) {
    if (i === gc.center || i === gc.friend) continue;
    order.push(i); // 中間枠は元順序を保持
  }
  order.push(gc.friend); // index5 = フレンド

  const tier = (i: number): EventBonusTier => (gc.eventTiers?.[i] ?? 'none') as EventBonusTier;
  return {
    deck: order.map((i) => findCardByMasterId(gc.deck[i])),
    bonusTiers: order.map((i) => tier(i)),
    trained: order.map((i) => gc.trained[i]),
    skillLevels: order.map((i) => gc.skillLevels[i]),
  };
}

describe('スプレッドシート v1.0.6 オラクル — ②engine差分レポート', () => {
  for (const gc of goldenCases) {
    const input = buildOracleInput(gc);
    const { deck, bonusTiers, trained, skillLevels } = reorderForEngine(gc);
    const song = findSongById(gc.songId);
    const options = { scoreUpAssist: gc.assist, scoreUpBadgeRate: gc.badgeRate };

    // golden #1 はブローチ/ラビットノート無し（buildOracleInput と同条件）→ engine も未指定
    const team = computeTeam(
      deck,
      allBroachs,
      song,
      bonusTiers,
      trained,
      undefined, // selectedBroachIds
      undefined, // sharedBroachSelections
      skillLevels,
      undefined, // rabbitNotes
    );
    const exclusion = computeShrinkExclusion(team, computeGroupSizes(song));
    // seed は固定。属性値・期待値・最大値はノート順序に依存しないので任意 seed で可
    const notes = flattenNotes(song, 42, exclusion);
    const notesCount = song.notes_count || notes.length;

    if (gc.expected) {
      it(`${gc.label}: expected モード差分分類 (attr/scoreUp/shrink/liveEnd/final)`, () => {
        const oracle = runOracle(input, 'expected');
        const eng = calcExpectedScore(team, notes, notesCount, options);

        const rows: { component: 'attr' | 'scoreUp' | 'shrink' | 'liveEnd' | 'final'; o: number; e: number }[] = [
          { component: 'attr', o: oracle.attr, e: eng.baseScore },
          { component: 'scoreUp', o: oracle.scoreUp, e: eng.scoreUpExpected },
          { component: 'shrink', o: oracle.shrink, e: eng.shrinkExpected },
          { component: 'liveEnd', o: oracle.liveEnd, e: eng.liveEndScore },
          { component: 'final', o: oracle.final, e: eng.finalScore },
        ];

        for (const r of rows) {
          const cls = classify(r.component, r.o, r.e);
          // eslint-disable-next-line no-console
          console.log(
            `[diff][${gc.label}][expected] ${r.component}: oracle=${r.o} engine=${r.e} delta=${r.e - r.o} class=${cls}`,
          );
          expect(cls, `${r.component}(expected) は unexpected (oracle=${r.o} engine=${r.e})`).not.toBe('unexpected');
        }
      });
    }

    if (gc.max) {
      it(`${gc.label}: max モード差分分類 (final のみ。他項目は engine 内訳なし)`, () => {
        const oracle = runOracle(input, 'max');
        const engFinal = calcMaxScore(team, notes, options);
        // eslint-disable-next-line no-console
        console.log(
          `[diff][${gc.label}][max] attr/scoreUp/shrink/liveEnd: engine内訳なし（比較対象外）`,
        );
        const cls = classify('final', oracle.final, engFinal);
        // eslint-disable-next-line no-console
        console.log(
          `[diff][${gc.label}][max] final: oracle=${oracle.final} engine=${engFinal} delta=${engFinal - oracle.final} class=${cls}`,
        );
        expect(cls, `final(max) は unexpected (oracle=${oracle.final} engine=${engFinal})`).not.toBe('unexpected');
      });
    }
  }
});
