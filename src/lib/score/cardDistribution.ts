/**
 * 衣装比較・詳細パネル用: 1枚あたりのスコア分布計算（デッキ非依存の純粋関数）。
 *
 * スキル発動成功回数 K は二項分布 Binomial(n, p) に従う（n=最大発動回数, p=発動率）。
 * - スコアアップ系: 合計スコア = baseScore + K×value
 * - 判定縮小系: カバー秒数 = K×value（value=1発動あたり縮小秒数、ベースは 0 秒）
 * 設計: docs/superpowers/specs/2026-06-18-card-compare-distribution-design.md
 */
import type { CardStrengthEntry } from './cardStrength';

/** 二項分布 Binomial(n, p) の確率質量関数。k=0..n の配列（総和 1） */
export function binomialPmf(n: number, p: number): number[] {
  const out: number[] = [];
  let c = 1; // C(n, k) を逐次更新（C(n,0)=1）
  for (let k = 0; k <= n; k++) {
    if (k > 0) c = (c * (n - k + 1)) / k;
    out.push(c * Math.pow(p, k) * Math.pow(1 - p, n - k));
  }
  return out;
}

/** その衣装の発動回数 n と発動率 p を取り出す（スキルなしは n=0, p=0） */
function nP(entry: CardStrengthEntry): { n: number; p: number } {
  const n = entry.maxActivations;
  const p = entry.skill ? entry.skill.per / 100 : 0;
  return { n: Math.max(n, 0), p };
}

/** スキル上乗せ分の t（0〜1）以上を出す確率 = P(K ≥ ceil(t·n)) */
export function reachProbability(entry: CardStrengthEntry, t: number): number {
  const { n, p } = nP(entry);
  if (n <= 0) return t <= 0 ? 1 : 0;
  const kMin = Math.ceil(t * n);
  if (kMin <= 0) return 1;
  if (kMin > n) return 0;
  const pmf = binomialPmf(n, p);
  let s = 0;
  for (let k = kMin; k <= n; k++) s += pmf[k];
  return s;
}

/** 各成功回数 k を絶対値（スコア or 秒数）にマップした分布点 */
export function cardScorePmf(entry: CardStrengthEntry): {
  metric: 'score' | 'cover';
  points: { x: number; prob: number }[];
} {
  const { n, p } = nP(entry);
  const isShrink = entry.skill?.isShrink ?? false;
  const metric = isShrink ? 'cover' : 'score';
  if (n <= 0 || !entry.skill) {
    // 分散ゼロ: 土台のみの 1 点スパイク
    return { metric, points: [{ x: isShrink ? 0 : entry.baseScore, prob: 1 }] };
  }
  const base = isShrink ? 0 : entry.baseScore;
  const value = entry.skill.value;
  const pmf = binomialPmf(n, p);
  const points = pmf.map((prob, k) => ({ x: base + k * value, prob }));
  return { metric, points };
}

/** 絶対値 x（ドラッグ位置）→ スキル上乗せ分割合 t（0〜1 にクランプ） */
export function valueToThreshold(entry: CardStrengthEntry, x: number): number {
  const { n } = nP(entry);
  const value = entry.skill?.value ?? 0;
  const span = n * value;
  if (span <= 0) return 0;
  const base = entry.skill?.isShrink ? 0 : entry.baseScore;
  return Math.min(1, Math.max(0, (x - base) / span));
}
