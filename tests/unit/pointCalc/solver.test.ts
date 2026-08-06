import { describe, it, expect } from 'vitest';
import { solve } from '../../../src/lib/pointCalc/solver';
import { buildCandidates } from '../../../src/lib/pointCalc/candidates';
import type { Candidate } from '../../../src/lib/pointCalc/candidates';

/** テスト用に pt 値だけを持つ候補を作る */
const fake = (...points: number[]): Candidate[] =>
  points.toSorted((a, b) => a - b).map(point => ({
    point,
    specs: [{ stars: 1, difficulty: 'EASY', playMode: '放置', bonusPct: 0, unit: 'weak', multiplier: 1 }],
  }));

describe('solve: 基本', () => {
  it('差異が候補ちょうどなら 1 行 1 回で解ける', () => {
    const [best] = solve({ diff: 100, candidates: fake(100) });
    expect(best.lines).toEqual([expect.objectContaining({ point: 100, count: 1 })]);
    expect(best.totalCount).toBe(1);
    expect(best.remainder).toBe(0);
  });

  it('同じ値を複数回使う場合は 1 行にまとめる', () => {
    const [best] = solve({ diff: 300, candidates: fake(100) });
    expect(best.lines).toHaveLength(1);
    expect(best.lines[0]).toMatchObject({ point: 100, count: 3 });
    expect(best.remainder).toBe(0);
  });

  it('複数の値を組み合わせてぴったりにする', () => {
    const [best] = solve({ diff: 130, candidates: fake(100, 30) });
    expect(best.remainder).toBe(0);
    expect(best.totalCount).toBe(2);
    expect(best.lines.map(l => l.point).toSorted((a, b) => a - b)).toEqual([30, 100]);
  });

  it('内訳の合計 + remainder が常に差異と一致する', () => {
    const results = solve({ diff: 7777, candidates: fake(79, 349, 1370, 2228) });
    for (const r of results) {
      const sum = r.lines.reduce((n, l) => n + l.point * l.count, 0);
      expect(sum).toBe(r.totalPoint);
      expect(sum + r.remainder).toBe(7777);
    }
  });

  it('残差の小さい順、同じならライブ回数の少ない順に並ぶ', () => {
    const results = solve({ diff: 7777, candidates: fake(79, 349, 1370, 2228) });
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const cur = results[i];
      expect(Math.abs(cur.remainder)).toBeGreaterThanOrEqual(Math.abs(prev.remainder));
      if (Math.abs(cur.remainder) === Math.abs(prev.remainder)) {
        expect(cur.totalCount).toBeGreaterThanOrEqual(prev.totalCount);
      }
    }
  });
});

describe('solve: 到達不能ケース', () => {
  it('ぴったり作れないときは残差付きの近似解を返す（空配列を返さない）', () => {
    const results = solve({ diff: 7, candidates: fake(100) });
    expect(results.length).toBeGreaterThan(0);
    const [best] = results;
    expect(best.remainder).not.toBe(0);
    // 100pt を 1 回叩いて 93pt 超過する解が出る
    expect(best.lines).toEqual([expect.objectContaining({ point: 100, count: 1 })]);
    expect(best.remainder).toBe(-93);
  });

  it('不足側と超過側の両方を候補に出す', () => {
    const results = solve({ diff: 253, candidates: fake(100) });
    const remainders = results.map(r => r.remainder).toSorted((a, b) => a - b);
    expect(remainders).toContain(53);  // 100 × 2 で 53pt 不足
    expect(remainders).toContain(-47); // 100 × 3 で 47pt 超過
  });

  it('近似解でも 内訳合計 + remainder = 差異 を満たす', () => {
    for (const r of solve({ diff: 253, candidates: fake(100) })) {
      const sum = r.lines.reduce((n, l) => n + l.point * l.count, 0);
      expect(sum + r.remainder).toBe(253);
    }
  });

  it('空の内訳（0 回で残り全部）は解として返さない', () => {
    for (const r of solve({ diff: 7, candidates: fake(100) })) {
      expect(r.lines.length).toBeGreaterThan(0);
      expect(r.totalCount).toBeGreaterThan(0);
    }
  });
});

describe('solve: 入力の境界', () => {
  it('候補が空なら空配列', () => {
    expect(solve({ diff: 100, candidates: [] })).toEqual([]);
  });

  it('差異が 0 なら空配列', () => {
    expect(solve({ diff: 0, candidates: fake(100) })).toEqual([]);
  });

  it('差異が負なら空配列', () => {
    expect(solve({ diff: -5, candidates: fake(100) })).toEqual([]);
  });

  it('mainPoint を明示すると必ずその値を主に使う', () => {
    const [best] = solve({ diff: 10000, candidates: fake(100, 5000), mainPoint: 100 });
    expect(best.lines.some(l => l.point === 100 && l.count >= 50)).toBe(true);
  });

  it('mainPoint に候補外の値を渡しても落ちない（最大値へフォールバック）', () => {
    const results = solve({ diff: 10000, candidates: fake(100, 5000), mainPoint: 12345 });
    expect(results.length).toBeGreaterThan(0);
  });

  it('maxResults で件数を絞れる', () => {
    expect(solve({ diff: 7777, candidates: fake(79, 349, 1370), maxResults: 2 }).length).toBeLessThanOrEqual(2);
  });

  it('差異がメイン pt より小さくても解ける', () => {
    const [best] = solve({ diff: 79, candidates: fake(79, 18075) });
    expect(best.remainder).toBe(0);
  });
});

describe('solve: 実データ相当', () => {
  it('差異 7,777,777 を PC 抜き・特効 0/150/300% でぴったり解ける', () => {
    const candidates = buildCandidates({
      bonusPcts: [0, 150, 300],
      playModes: ['放置', 'オート', 'FC'],
      units: ['max', 'ssr1', 'weak'],
      multipliers: [1, 2, 3],
    });
    const results = solve({ diff: 7_777_777, candidates });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].remainder).toBe(0);
    // 最大 pt は ★5 EXPERT FC 300% 3倍 = 18,075。430 回強で届く
    expect(results[0].totalCount).toBeLessThan(500);
  });

  it('特効%を全達成段階に広げても 3 秒以内に返る', () => {
    const bonusPcts = new Set<number>();
    for (let a = 0; a <= 6; a++) {
      for (let b = 0; b <= 6 - a; b++) {
        for (let c = 0; c <= 6 - a - b; c++) bonusPcts.add(a * 50 + b * 20 + c * 5);
      }
    }
    const candidates = buildCandidates({
      bonusPcts: [...bonusPcts].filter(p => p <= 300),
      playModes: ['放置', 'オート', 'FC'],
      units: ['max', 'ssr1', 'weak'],
      multipliers: [1, 2, 3],
    });
    const start = performance.now();
    const results = solve({ diff: 7_777_777, candidates });
    expect(performance.now() - start).toBeLessThan(3000);
    expect(results[0].remainder).toBe(0);
  });
});

/**
 * mulberry32: シード固定の擬似乱数生成器。テストの再現性のために Math.random は使わない。
 */
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 32bit整数のラップアラウンドが必要で Math.trunc では代替できない
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    // oxlint-disable-next-line unicorn/prefer-math-trunc -- 符号なし32bit整数への変換が必要で Math.trunc では代替できない
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 素朴な unbounded coin change の最小枚数 DP。solver.ts の二分探索+枝刈り DP と
 * 独立した実装で正しさを突き合わせる基準にする。
 */
function naiveMinCoins(points: readonly number[], target: number): number {
  const INF = Number.POSITIVE_INFINITY;
  const dp = Array.from<number>({ length: target + 1 }).fill(INF);
  dp[0] = 0;
  for (let amount = 1; amount <= target; amount++) {
    for (const p of points) {
      if (p <= amount && dp[amount - p] + 1 < dp[amount]) dp[amount] = dp[amount - p] + 1;
    }
  }
  return dp[target];
}

describe('solve: DP枝刈りの正しさ（乱択プロパティテスト）', () => {
  // diff < maxPoint（候補の最大値）に限れば kBase = 0 になり、solve() の結果は
  // 「候補全体を使った diff 単体の unbounded coin change の最小枚数」に一致するはず。
  // これを素朴な DP（naiveMinCoins）と数百ケース突き合わせて、二分探索+降順走査+
  // 許容下界による枝刈りが最適性を壊していないことを検証する。
  const rand = mulberry32(0xc0ffee);
  const TRIALS = 300;

  it(`${TRIALS} 件の乱択ケースで solve() が naiveMinCoins と一致する`, () => {
    let reachableCases = 0;
    let unreachableCases = 0;
    for (let trial = 0; trial < TRIALS; trial++) {
      const size = 2 + Math.floor(rand() * 4); // 2..5 種類
      const pointSet = new Set<number>();
      while (pointSet.size < size) {
        pointSet.add(1 + Math.floor(rand() * 60)); // 1..60
      }
      const points = [...pointSet].toSorted((a, b) => a - b);
      const maxPoint = points.at(-1)!;
      if (maxPoint < 2) continue; // diff を作れない
      const diff = 1 + Math.floor(rand() * (maxPoint - 1)); // 1..maxPoint-1 → kBase = 0

      const candidates = fake(...points);
      const results = solve({ diff, candidates });
      const naive = naiveMinCoins(points, diff);

      if (Number.isFinite(naive)) {
        reachableCases++;
        const exact = results.find(r => r.remainder === 0);
        expect(exact, `diff=${diff} points=${points} で naive=${naive} だが solve() にぴったり解が無い`).toBeDefined();
        expect(exact!.totalCount, `diff=${diff} points=${points}`).toBe(naive);
      } else {
        unreachableCases++;
        const exact = results.find(r => r.remainder === 0);
        expect(exact, `diff=${diff} points=${points} は到達不能なはずだが solve() がぴったり解を返した`).toBeUndefined();
      }
    }
    // 両方のケース種別が十分な件数含まれていることを確認（乱数の偏りで片方に倒れていないこと）
    expect(reachableCases).toBeGreaterThan(50);
    expect(unreachableCases).toBeGreaterThan(50);
  });
});

/**
 * naiveMinCoins の全区間版。amount 0..maxTarget の最小枚数を 1 回の DP で求め、
 * 複数の diff に対する到達可否判定を毎回 O(diff × 候補数) で作り直さずに済ませる。
 */
function naiveMinCoinsTable(points: readonly number[], maxTarget: number): number[] {
  const INF = Number.POSITIVE_INFINITY;
  const dp = Array.from<number>({ length: maxTarget + 1 }).fill(INF);
  dp[0] = 0;
  for (let amount = 1; amount <= maxTarget; amount++) {
    for (const p of points) {
      if (p <= amount && dp[amount - p] + 1 < dp[amount]) dp[amount] = dp[amount - p] + 1;
    }
  }
  return dp;
}

describe('solve: kBack の探索幅（DEFAULT_K_BACK 固定値による取りこぼしの回帰テスト）', () => {
  // レビューで実測した取りこぼし repro: 候補を極端に絞る（bonusPct 300% のみ・FC のみ・
  // MAX編成のみ・倍率3倍のみ）と候補は 20 個・最小 10,050pt になる。この設定で
  // 差異 150,000〜150,299 を調べると、候補の gcd が 3 のため約 2/3 の差異はそもそも
  // 数学的に到達不能（naiveMinCoinsTable で判定できる ground truth）。
  // 固定 kBack=2 では、残る「本来到達可能な差異」のうち 66/300 件でぴったり解を
  // 取りこぼしていた（近似解を返してしまう）。kBack を R_BUDGET から適応的に広げる
  // ことで、到達可能な差異は 1 件も取りこぼさないことをここで固定する。
  const candidates = buildCandidates({
    bonusPcts: [300],
    playModes: ['FC'],
    units: ['max'],
    multipliers: [3],
  });
  const points = candidates.map(c => c.point);
  const RANGE_START = 150_000;
  const RANGE_END = 150_299;
  const reachabilityTable = naiveMinCoinsTable(points, RANGE_END);
  // 総当たり300件は重いので6件おきに間引く（50件）。取りこぼしが再発すれば依然として検知できる。
  const sampleDiffs: number[] = [];
  for (let diff = RANGE_START; diff <= RANGE_END; diff += 6) sampleDiffs.push(diff);

  it(`差異 ${RANGE_START}〜${RANGE_END} を間引いた ${sampleDiffs.length} 件で、到達可能な差異のぴったり解を1件も取りこぼさない`, () => {
    let checkedReachable = 0;
    for (const diff of sampleDiffs) {
      const reachable = Number.isFinite(reachabilityTable[diff]);
      const results = solve({ diff, candidates });
      const exact = results.some(r => r.remainder === 0);
      if (reachable) {
        checkedReachable++;
        expect(exact, `diff=${diff} は到達可能（naive最小回数=${reachabilityTable[diff]}）なのに solve() がぴったり解を取りこぼした`).toBe(true);
      } else {
        expect(exact, `diff=${diff} は候補の gcd から到達不能なはずなのに solve() がぴったり解を返した`).toBe(false);
      }
    }
    // サンプリングが偏って「到達可能ケースが 0 件」のまま素通りしていないことの保険
    expect(checkedReachable).toBeGreaterThan(10);
    // v8 カバレッジ計測下では計装オーバーヘッドで既定の 5 秒を超えるため、このテストだけ延長する
  }, 30_000);
});
