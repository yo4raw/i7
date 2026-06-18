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
