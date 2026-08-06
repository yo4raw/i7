import type { Candidate } from './candidates';
import type { LiveSpec } from './types';

export interface SolverInput {
  /** 目標pt − 現在pt。正の整数のみ扱う */
  diff: number;
  /** point 昇順の候補（buildCandidates の出力） */
  candidates: Candidate[];
  /** メイン周回に使う pt。未指定または候補外なら候補の最大値 */
  mainPoint?: number;
  /** メイン周回を何回まで減らして候補を作るか */
  kBack?: number;
  maxResults?: number;
}

export interface SolutionLine {
  point: number;
  count: number;
  /** その pt を出せる条件（先頭が代表） */
  specs: LiveSpec[];
}

export interface Solution {
  lines: SolutionLine[];
  totalCount: number;
  totalPoint: number;
  /** diff − totalPoint。0 ならぴったり、正なら不足、負なら超過 */
  remainder: number;
}

export const DEFAULT_K_BACK = 2;
export const DEFAULT_MAX_RESULTS = 5;
/**
 * kBack を適応的に決めるときの端数 DP 予算（pt）。rMax ≈ (kBack + 1) * mainPoint が
 * この値程度に収まるよう kBack = floor(R_BUDGET / mainPoint) とする。
 * mainPoint が大きい（＝候補が絞られていて探索が軽い）ときほど kBack を広げ、
 * 固定 kBack=2 では取りこぼしていたぴったり解を拾う。DEFAULT_K_BACK 未満には縮めない。
 */
export const R_BUDGET = 200_000;

const UNREACHABLE = 0x3fff_ffff;

export function solve(input: SolverInput): Solution[] {
  const { diff, candidates } = input;
  if (diff <= 0 || candidates.length === 0) return [];

  const maxResults = input.maxResults ?? DEFAULT_MAX_RESULTS;

  const points = Int32Array.from(candidates.map(c => c.point));
  const specsOf = new Map(candidates.map(c => [c.point, c.specs]));
  const maxPoint = points.at(-1)!;
  const mainPointExplicit = input.mainPoint !== undefined && specsOf.has(input.mainPoint);
  const mainPoint = mainPointExplicit ? input.mainPoint! : maxPoint;

  const kBase = Math.floor(diff / mainPoint);
  // 明示指定があれば常にそれを使う（後方互換）。
  // mainPoint をユーザーが明示指定したときは「主にその pt を使う」意図を尊重し、
  // 従来通り kBase 近傍の狭い範囲だけを探索する（DEFAULT_K_BACK）。
  // mainPoint 未指定（候補最大値を自動採用）のときだけ、R_BUDGET の予算内で
  // DEFAULT_K_BACK 以上・kBase 以下まで広げる。mainPoint が大きい＝候補が絞られて
  // 探索が軽いケースほど広く探索できるので、固定 kBack=2 では取りこぼしていた
  // ぴったり解を拾える（kBase を超えても kMin は 0 で飽和するだけなので無意味）。
  const kBack = input.kBack ?? (mainPointExplicit
    ? DEFAULT_K_BACK
    : Math.min(kBase, Math.max(DEFAULT_K_BACK, Math.floor(R_BUDGET / mainPoint))));
  const kMin = Math.max(0, kBase - kBack);
  // 末尾の + mainPoint は超過側の近似解を作るための余裕。
  // これが無いと「候補 100pt だけ・差異 7pt」で 0 回の解しか作れず結果が空になる。
  const rMax = diff - kMin * mainPoint + mainPoint;

  /**
   * points（昇順）の中から amount 以下の最大値のインデックスを二分探索で返す。
   * 該当なし（points[0] > amount）なら -1。
   */
  function maxIndexWithin(amount: number): number {
    let lo = 0;
    let hi = points.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (points[mid] <= amount) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  // 0..rMax の各金額をぴったり作る最小ライブ回数と、その 1 手前に使った値
  const minCount = new Int32Array(rMax + 1).fill(UNREACHABLE);
  const pickedPoint = new Int32Array(rMax + 1).fill(-1);
  minCount[0] = 0;
  for (let amount = 1; amount <= rMax; amount++) {
    let best = UNREACHABLE;
    let bestPoint = -1;
    // 候補点は大きい方から見る（大きい pt ほど残り回数を早く減らせるため best が早く小さくなる）。
    // 候補が数千件になる実データ相当ケースでは、大きい pt を先に試すことで
    // 「これ以上小さい pt を見ても best を更新できない」という分岐限定法の枝刈りが早期に効く。
    for (let i = maxIndexWithin(amount); i >= 0; i--) {
      const p = points[i];
      const remain = amount - p;
      // どの pt を選んでも 1 回あたり最大 maxPoint pt しか進まないので、
      // remain を作るには最低 ceil(remain / maxPoint) 回が必要（許容下界）。
      // pt は降順に見ているため remain は単調増加し、この下界も単調非減少 → 一度打ち切り条件を
      // 満たしたら以降の（より小さい）pt を見ても best は絶対に更新できない。
      const lowerBound = Math.trunc((remain + maxPoint - 1) / maxPoint);
      if (lowerBound + 1 >= best) break;
      const prev = minCount[remain];
      if (prev + 1 < best) {
        best = prev + 1;
        bestPoint = p;
        if (best === 1) break; // 理論上の最小値（1 回）に到達。これ以上の改善はあり得ない
      }
    }
    minCount[amount] = best;
    pickedPoint[amount] = bestPoint;
  }

  /**
   * amount 自身が到達可能ならそれだけを、到達不能なら直下と直上の到達可能な金額を返す。
   * minCount[0] = 0 なので直下は必ず見つかる（最悪 0）。直上は範囲外なら省かれる。
   */
  function reachableAround(amount: number): number[] {
    if (minCount[amount] < UNREACHABLE) return [amount];
    let below = 0;
    for (let a = amount - 1; a > 0; a--) {
      if (minCount[a] < UNREACHABLE) { below = a; break; }
    }
    const result = [below];
    for (let a = amount + 1; a <= rMax; a++) {
      if (minCount[a] < UNREACHABLE) { result.push(a); break; }
    }
    return result;
  }

  const solutions: Solution[] = [];
  const seen = new Set<string>();
  for (let k = kBase; k >= kMin; k--) {
    const target = diff - k * mainPoint;
    for (const reached of reachableAround(target)) {
      const counts = new Map<number, number>();
      if (k > 0) counts.set(mainPoint, k);
      for (let amount = reached; amount > 0;) {
        const p = pickedPoint[amount];
        counts.set(p, (counts.get(p) ?? 0) + 1);
        amount -= p;
      }
      // 「0 回で残り全部」は解として無意味なので捨てる
      if (counts.size === 0) continue;

      const lines: SolutionLine[] = [...counts.entries()]
        .map(([point, count]) => ({ point, count, specs: specsOf.get(point) ?? [] }))
        .toSorted((a, b) => b.point - a.point);
      const key = lines.map(l => `${l.point}x${l.count}`).join(',');
      if (seen.has(key)) continue;
      seen.add(key);

      const totalPoint = lines.reduce((n, l) => n + l.point * l.count, 0);
      const totalCount = lines.reduce((n, l) => n + l.count, 0);
      solutions.push({ lines, totalCount, totalPoint, remainder: diff - totalPoint });
    }
  }

  // ぴったりの解を先頭に出す。同じ残差ならライブ回数の少ない順
  return solutions
    .toSorted((a, b) => Math.abs(a.remainder) - Math.abs(b.remainder) || a.totalCount - b.totalCount)
    .slice(0, maxResults);
}
