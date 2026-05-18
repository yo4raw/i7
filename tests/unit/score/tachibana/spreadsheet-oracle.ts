/**
 * たちばなさんロジック スプレッドシート計算式オラクル (テスト専用)
 *
 * 公開シート (https://docs.google.com/spreadsheets/d/1st1aSskGKKKl4H-XLFsTQ8zMnwrGRjqgFgdDs5bhLns/) の
 * 「スコア計算」シートの各セル (AM/AN/.../BA/BB/.../BF/BI..BN/H..M/D) の formula を
 * 可能な限り 1:1 で TypeScript に書き起こした実装。
 *
 * `src/lib/score/tachibana/engine.ts` の `computeTachibanaResult` とは別の実装で、
 * 同じ入力に対して同じ結果を返すべき。両者の出力を突き合わせることでバグ検出力を高める。
 *
 * 命名はシートのセル位置を反映 (例: `BA11` は `cellBA11` のように)。
 */

import type { ComputedTeam, DeckCard, AttributeName } from '../../../../src/lib/score/types';
import type { Song, SongNoteGroup } from '../../../../src/lib/data/fetchSongsJson';
import type { TachibanaOptions, TachibanaResult } from '../../../../src/lib/score/tachibana';

const ROUNDDOWN = (n: number) => Math.trunc(n); // シートの ROUNDDOWN(x, 0) と等価 (正の値前提)
const ROUND = (n: number) => Math.round(n);

const SECTION_KEYS: (keyof Pick<Song, 'notes_20' | 'light_2' | 'light_3' | 'light_4' | 'light_5' | 'light_6' | 'chorus_light_5' | 'chorus_light_6'>)[] = [
  'notes_20', 'light_2', 'light_3', 'light_4', 'light_5', 'light_6', 'chorus_light_5', 'chorus_light_6',
];
const SECTION_MULTIPLIERS = [1.0, 1.0, 1.1, 1.2, 1.3, 1.5, 2.6, 3.0]; // AZ22..AZ29
const ATTR_MULT_BY_INDEX_FROM_2: number[] = [1.1, 1.2, 1.3, 1.5, 2.6, 3.0]; // AZ12..AZ17 (BA12..BF17 用)

/** スキル種別判定 (H31): "スコアアップ" | "判定領域縮小" | "" */
function cellH31(card: DeckCard): string {
  const t = card.skill?.originalType ?? '';
  if (t.startsWith('スコアアップ')) return 'スコアアップ';
  if (t.startsWith('判定縮小')) return '判定領域縮小';
  return '';
}

/** 発動条件 (H33): "Perfect" | "コンボ" | "タイマー" | "" */
function cellH33(card: DeckCard): string {
  const t = card.skill?.originalType ?? '';
  const m = t.match(/（(.+?)）/);
  return m ? m[1] : '';
}

/** AM74 系のセンター/フレンドブースト係数 (1 + 0.1*matched_center + 0.1*matched_friend) */
function attrBoost(attr: AttributeName, center: AttributeName | null, friend: AttributeName | null): number {
  return 1 + (center === attr ? 0.1 : 0) + (friend === attr ? 0.1 : 0);
}

/**
 * オラクル本体: シートのセル順序通りに値を組み上げて、最終的に D20-D24 を返す。
 */
export function computeTachibanaOracle(team: ComputedTeam, song: Song, options: TachibanaOptions): TachibanaResult {
  // 楽曲基本データ (D8 = ノーツ数, D9 = 秒数)
  const D8 = song.notes_count ?? 0;
  const D9 = song.duration ?? 0;

  // J20 / M20: センター/フレンドの属性
  const J20 = team.cards[0]?.attribute ?? null;
  const M20 = team.cards[5]?.attribute ?? null;

  // ---- 各カードの属性値 (AM/AN/AO/AP/AQ/AR の per-card 計算)
  // ComputedTeam.cards[i] には:
  //   - shout_max = ROUND((train-adjusted + rabbit_note) × (1 + bonus)) = AM29 相当
  //   - broachShout = AM58 相当 (resolveDeckBroachs 後の合計)
  // よって AM63 = card.shout_max + card.broachShout
  const perCardShout = team.cards.map((c) => (c.shout_max ?? 0) + (c.broachShout ?? 0));   // AM63 / AN63 / ...
  const perCardBeat  = team.cards.map((c) => (c.beat_max  ?? 0) + (c.broachBeat  ?? 0));   // AM64 / ...
  const perCardMelody = team.cards.map((c) => (c.melody_max ?? 0) + (c.broachMelody ?? 0)); // AM65 / ...

  // ---- AN67..AN72 (Shout) / AP67..AP72 (Beat) / AR67..AR72 (Melody): デッキ集約
  const sumWithoutFriend = (arr: number[]) => arr.slice(0, 5).reduce((a, b) => a + b, 0);
  const friendOnly = (arr: number[]) => arr[5] ?? 0;

  const an67 = sumWithoutFriend(perCardShout);     // AM63:AQ63 (5枚, AR は friend)
  const ap67 = sumWithoutFriend(perCardBeat);
  const ar67 = sumWithoutFriend(perCardMelody);
  // ラビットノート加算 (シートでは AU26/AV26/AW26 を加算) — 既に card.shout_max が rabbit_note 込みなのでここでは 0
  const an68 = an67;
  const ap68 = ap67;
  const ar68 = ar67;
  // フレンドカード加算
  const an69 = an68 + friendOnly(perCardShout);
  const ap69 = ap68 + friendOnly(perCardBeat);
  const ar69 = ar68 + friendOnly(perCardMelody);
  // センター/フレンドスキル属性ブースト (+0.1 each if match)
  const an71 = ROUNDDOWN(an69 * attrBoost('Shout', J20, M20));
  const ap71 = ROUNDDOWN(ap69 * attrBoost('Beat',  J20, M20));
  const ar71 = ROUNDDOWN(ar69 * attrBoost('Melody', J20, M20));
  // 特効 ON で ×1.2
  const SE = options.specialEffectActive;
  const an72 = SE ? ROUNDDOWN(an71 * 1.2) : an71;
  const ap72 = SE ? ROUNDDOWN(ap71 * 1.2) : ap71;
  const ar72 = SE ? ROUNDDOWN(ar71 * 1.2) : ar71;

  // ---- BA11..BF11 (各サブカラム × deck total × NOTE_RATE)
  const ba11 = ROUNDDOWN(an72 * 0.025); // shout_white
  const bb11 = ROUNDDOWN(an72 * 0.030); // shout_color
  const bc11 = ROUNDDOWN(ap72 * 0.025); // beat_white
  const bd11 = ROUNDDOWN(ap72 * 0.030); // beat_color
  const be11 = ROUNDDOWN(ar72 * 0.025); // melody_white
  const bf11 = ROUNDDOWN(ar72 * 0.030); // melody_color

  // ---- BA12..BF17: BA11..BF11 × AZ12..AZ17 (1.1, 1.2, 1.3, 1.5, 2.6, 3.0)
  // 結合した 8 行 (BA11/BB11/.../BF11 row が ×1.0 で行 11 と 12 で共有, BA12..BF17 で残り 6 行)
  const sectionCoeffs: { sw: number; sc: number; bw: number; bc: number; mw: number; mc: number }[] = [];
  // 行 11 と行 12 (notes_20, light_2 = ×1.0): 同じ BA11..BF11
  sectionCoeffs.push({ sw: ba11, sc: bb11, bw: bc11, bc: bd11, mw: be11, mc: bf11 });
  sectionCoeffs.push({ sw: ba11, sc: bb11, bw: bc11, bc: bd11, mw: be11, mc: bf11 });
  // 行 13..18 (light_3..chorus_light_6): BA12..BF17 = ROUNDDOWN(BA11..BF11 × multiplier)
  for (const mult of ATTR_MULT_BY_INDEX_FROM_2) {
    sectionCoeffs.push({
      sw: ROUNDDOWN(ba11 * mult),
      sc: ROUNDDOWN(bb11 * mult),
      bw: ROUNDDOWN(bc11 * mult),
      bc: ROUNDDOWN(bd11 * mult),
      mw: ROUNDDOWN(be11 * mult),
      mc: ROUNDDOWN(bf11 * mult),
    });
  }

  // ---- BI11:BN18 行列 = 各セクション × 各サブカラム × 楽曲ノーツ数
  const matrix: number[][] = sectionCoeffs.map((c, sectionIdx) => {
    const g = song[SECTION_KEYS[sectionIdx]] as SongNoteGroup;
    return [
      c.sw * (g.shout_white  ?? 0),
      c.sc * (g.shout_color  ?? 0),
      c.bw * (g.beat_white   ?? 0),
      c.bc * (g.beat_color   ?? 0),
      c.mw * (g.melody_white ?? 0),
      c.mc * (g.melody_color ?? 0),
    ];
  });

  // D20 = BN21 = SUM(BI11:BN18)
  const D20 = matrix.flat().reduce((a, b) => a + b, 0);

  // ---- per-card スキル計算 (H32..H40)
  // H32 = スキルレベル (5固定 in 本実装), H34 = count, H35 = per, H36 = value, H37 = rate
  // H31 = スキル種別, H33 = 発動条件
  // H38 = スコアアップ score-up 期待値
  // H39 = 縮小スキル per second
  // H40 = 縮小スキル score
  const perCardScoreUp: number[] = [];
  const perCardShrinkSec: number[] = []; // H39
  const perCardShrinkRate: number[] = []; // H37
  for (const card of team.cards) {
    const t = cellH31(card);
    const req = cellH33(card);
    const skill = card.skill;
    if (!skill) {
      perCardScoreUp.push(0);
      perCardShrinkSec.push(0);
      perCardShrinkRate.push(0);
      continue;
    }
    const H34 = skill.count;
    const H35 = skill.per;
    const H36 = skill.value;
    const H37 = skill.rate;
    if (H34 === 0) {
      perCardScoreUp.push(0);
      perCardShrinkSec.push(0);
      perCardShrinkRate.push(H37);
      continue;
    }

    // 分母: Perfect/コンボ は D8 (ノーツ数), タイマー は D9 (秒数)
    const denom = req === 'タイマー' ? D9 : D8;
    if (req !== 'Perfect' && req !== 'コンボ' && req !== 'タイマー') {
      perCardScoreUp.push(0);
      perCardShrinkSec.push(0);
      perCardShrinkRate.push(H37);
      continue;
    }

    if (t === 'スコアアップ') {
      // H38 = ROUNDDOWN(denom / H34 × prob_coeff × H36)
      let probCoeff: number;
      if (options.scoreUpFullActivation) {
        probCoeff = 1;
      } else if (options.scoreUpProbabilityBoost) {
        probCoeff = (H35 + options.scoreUpProbabilityBoostValue) / 100;
      } else {
        probCoeff = H35 / 100;
      }
      perCardScoreUp.push(ROUNDDOWN((denom / H34) * probCoeff * H36));
      perCardShrinkSec.push(0);
      perCardShrinkRate.push(0);
    } else if (t === '判定領域縮小') {
      // H39 = ROUNDDOWN(denom / H34 × (B15 ? 1 : H35/100) × H36)
      const probCoeff = options.shrinkFullActivation ? 1 : (H35 / 100);
      perCardScoreUp.push(0);
      perCardShrinkSec.push(ROUNDDOWN((denom / H34) * probCoeff * H36));
      perCardShrinkRate.push(H37);
    } else {
      perCardScoreUp.push(0);
      perCardShrinkSec.push(0);
      perCardShrinkRate.push(H37);
    }
  }

  // D21 = SUM(H38:M38)
  const D21 = perCardScoreUp.reduce((a, b) => a + b, 0);

  // BN22 = if(I6=TRUE, ROUNDDOWN(SUM/1.2, 0), BN21) — "特効なし" 基準
  const BN22 = SE ? ROUNDDOWN(D20 / 1.2) : D20;
  // BN23 = "20ノーツなし" 基準 = SUM(BI12:BN18) ÷ (特効 ? 1.2 : 1)
  const notes20Sum = matrix[0].reduce((a, b) => a + b, 0); // notes_20 行 (BI11..BN11)
  const sumExcludingNotes20 = D20 - notes20Sum;
  const BN23 = SE ? ROUNDDOWN(sumExcludingNotes20 / 1.2) : sumExcludingNotes20;

  // M6 = SUM(H39:M39) / D9
  const sumH39ToM39 = perCardShrinkSec.reduce((a, b) => a + b, 0);
  const M6 = D9 > 0 ? sumH39ToM39 / D9 : 0;

  // H40 = 縮小 per-card final
  const perCardShrink: number[] = perCardShrinkSec.map((sec, i) => {
    const rate = perCardShrinkRate[i];
    if (rate <= 1) return 0;
    const factor = rate - 1; // H37 - 1
    if (M6 >= 1) {
      const pool = options.excludeNotes20 ? BN23 : BN22;
      const weight = sumH39ToM39 > 0 ? sec / sumH39ToM39 : 0;
      return ROUNDDOWN(pool * weight * factor);
    } else {
      return ROUNDDOWN(BN22 * (D9 > 0 ? sec / D9 : 0) * factor);
    }
  });

  // D22 = SUM(H40:M40)
  const D22 = perCardShrink.reduce((a, b) => a + b, 0);

  // D23 = SUM(D20, D21, D22)
  const D23 = D20 + D21 + D22;

  // D24 = IF(K6=TRUE, ROUNDDOWN(D23 × (1 + 設定!B3), 0), D23)
  const D24 = options.scoreUpBadgeRate > 0
    ? ROUNDDOWN(D23 * (1 + options.scoreUpBadgeRate / 100))
    : D23;

  // per-card 内訳 (AM74 系) — engine 側との比較用
  const cardCoeff = (attr: AttributeName) => {
    return SECTION_KEYS.reduce((acc, key, i) => {
      const g = song[key] as SongNoteGroup;
      const mult = SECTION_MULTIPLIERS[i];
      const white = attr === 'Shout' ? g.shout_white : attr === 'Beat' ? g.beat_white : g.melody_white;
      const color = attr === 'Shout' ? g.shout_color : attr === 'Beat' ? g.beat_color : g.melody_color;
      return acc + mult * ((white ?? 0) * 0.025 + (color ?? 0) * 0.030);
    }, 0);
  };
  const coeffShout = cardCoeff('Shout');
  const coeffBeat  = cardCoeff('Beat');
  const coeffMelody = cardCoeff('Melody');
  const cards = team.cards.map((c, i) => {
    const shoutPost = perCardShout[i];
    const beatPost  = perCardBeat[i];
    const melodyPost = perCardMelody[i];
    const attrScore = ROUNDDOWN(
      shoutPost  * attrBoost('Shout',  J20, M20) * coeffShout +
      beatPost   * attrBoost('Beat',   J20, M20) * coeffBeat +
      melodyPost * attrBoost('Melody', J20, M20) * coeffMelody,
    );
    return {
      slotIndex: i,
      cardName: c.cardname,
      attribute: c.attribute,
      attributeScore: attrScore,
      scoreUpScore: perCardScoreUp[i],
      shrinkScore: perCardShrink[i],
      skillTypeLabel: c.skill?.originalType ?? '',
      skillReqLabel: cellH33(c),
    };
  });

  return {
    attributeScore: D20,
    scoreUpScore: D21,
    shrinkScore: D22,
    liveEndScore: D23,
    finalScore: D24,
    cards,
    shrinkCoverage: M6,
  };
}

// 不使用変数の lint 抑止用 (デバッグ時に検証用エクスポート)
export const _unused = { ROUND };
