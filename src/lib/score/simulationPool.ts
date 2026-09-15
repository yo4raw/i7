/**
 * MC シミュレーションを Web Worker に分散して実行する (ADR 0087)。
 * 試行回数を Worker 数で分割し、各 Worker の SimulationResult を 1 つに合成する。
 */
import { runSimulation, summarizeScores } from './simulation';
import { MC_CHUNK_SIZE } from './constants';
import type { ComputedTeam, FlatNote, ScoreOptions, SimulationResult } from './types';
import type { SimulationWorkerRequest, SimulationWorkerResponse } from './simulation.worker';

/** iterations を workerCount 個へ、端数を先頭から 1 ずつ配って分割する (合計は iterations に一致) */
export function splitIterations(iterations: number, workerCount: number): number[] {
  const base = Math.floor(iterations / workerCount);
  const rest = iterations % workerCount;
  return Array.from({ length: workerCount }, (_, i) => base + (i < rest ? 1 : 0)).filter((n) => n > 0);
}

/** 各 Worker の結果を 1 つに合成する。分布統計は全スコアから再計算、カード統計は試行回数で加重平均する */
export function mergeSimulationResults(parts: SimulationResult[]): SimulationResult {
  if (parts.length === 1) return parts[0];
  const scores = parts.flatMap((p) => p.scores);
  const total = scores.length;
  const first = parts[0];
  const cardStats = first.cardStats.map((cs, i) => ({
    ...cs,
    avgActivations: parts.reduce((acc, p) => acc + p.cardStats[i].avgActivations * p.scores.length, 0) / total,
    avgScoreContribution: parts.reduce((acc, p) => acc + p.cardStats[i].avgScoreContribution * p.scores.length, 0) / total,
  }));
  return {
    minScore: first.minScore,
    maxScore: first.maxScore,
    scores,
    ...summarizeScores(scores),
    cardStats,
    shrinkScores: parts.flatMap((p) => p.shrinkScores),
    scoreUpScores: parts.flatMap((p) => p.scoreUpScores),
  };
}

function runInWorker(workers: Worker[], req: SimulationWorkerRequest, onProgress: (pct: number) => void): Promise<SimulationResult> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./simulation.worker.ts', import.meta.url), { type: 'module' });
    workers.push(w);
    const done = () => w.terminate();
    w.addEventListener('error', (e) => { done(); reject(new Error(`シミュレーション Worker でエラーが発生しました: ${e.message}`)); });
    w.addEventListener('message', (e: MessageEvent<SimulationWorkerResponse>) => {
      const msg = e.data;
      if (msg.type === 'progress') { onProgress(msg.pct); return; }
      done();
      if (msg.type === 'result') resolve(msg.result);
      else reject(new Error(`シミュレーション Worker でエラーが発生しました: ${msg.message}`));
    });
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- 専用 Worker#postMessage に targetOrigin 引数は存在しない (Window#postMessage 専用の引数)
    w.postMessage(req);
  });
}

/**
 * runSimulation と同じシグネチャで、Worker に分散して実行する。
 * Worker が使えない環境 (SSR・単体テスト) と、Worker の生成・実行に失敗した場合は
 * メインスレッドの runSimulation にフォールバックする。
 */
export async function runSimulationParallel(
  team: ComputedTeam,
  notes: FlatNote[],
  iterations: number,
  onProgress?: (pct: number) => void,
  seed?: number,
  options?: ScoreOptions,
): Promise<SimulationResult> {
  // oxlint-disable-next-line unicorn/no-typeof-undefined -- Worker はブラウザ専用グローバルで node には未宣言。typeof ガードが必須
  if (typeof Worker === 'undefined') return runSimulation(team, notes, iterations, onProgress, seed, options);
  const workerCount = Math.min(
    8,
    Math.max(1, (navigator.hardwareConcurrency || 4) - 1),
    Math.max(1, Math.ceil(iterations / MC_CHUNK_SIZE)),
  );
  const per = splitIterations(iterations, workerCount);
  const baseSeed = seed ?? Date.now();
  const pcts = per.map(() => 0);
  const workers: Worker[] = [];
  try {
    const parts = await Promise.all(per.map((n, i) =>
      runInWorker(workers, { team, notes, iterations: n, seed: baseSeed + i, options }, (pct) => {
        pcts[i] = pct;
        onProgress?.(pcts.reduce((acc, p, j) => acc + p * per[j], 0) / iterations);
      }),
    ));
    return mergeSimulationResults(parts);
  } catch (err) {
    // 1 つでも失敗したら残りの Worker を止め、メインスレッドで 1 回だけやり直す
    for (const w of workers) w.terminate();
    console.warn('シミュレーション Worker に失敗したためメインスレッドで実行します', err);
    return runSimulation(team, notes, iterations, onProgress, seed, options);
  }
}
