/// <reference lib="webworker" />
/**
 * スコア計算 MC シミュレーション Worker (ADR 0087)。
 * 1 リクエスト = 1 回の runSimulation。進捗を progress で返し、完了時に result を返す。
 * ロジックはすべて simulation.ts (テスト済み) に委譲する。
 */
import { runSimulation } from './simulation';
import type { ComputedTeam, FlatNote, ScoreOptions, SimulationResult } from './types';

export interface SimulationWorkerRequest {
  team: ComputedTeam;
  notes: FlatNote[];
  iterations: number;
  seed: number;
  options?: ScoreOptions;
}

export type SimulationWorkerResponse =
  | { type: 'progress'; pct: number }
  | { type: 'result'; result: SimulationResult }
  | { type: 'error'; message: string };

/* v8 ignore start -- Worker ブートストラップ（実 Worker 環境専用、node 単体テスト不可） */
declare const self: DedicatedWorkerGlobalScope;
// oxlint-disable-next-line unicorn/no-typeof-undefined -- self はブラウザ/Worker専用グローバルで node には存在せず未宣言。`self !== undefined` は ReferenceError になるため typeof ガードが必須
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const post = (msg: SimulationWorkerResponse) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- 専用 Worker (DedicatedWorkerGlobalScope) の self.postMessage に targetOrigin 引数は存在しない
    self.postMessage(msg);
  };
  self.addEventListener('message', (e: MessageEvent<SimulationWorkerRequest>) => {
    const { team, notes, iterations, seed, options } = e.data;
    runSimulation(team, notes, iterations, (pct) => post({ type: 'progress', pct }), seed, options)
      .then((result) => post({ type: 'result', result }))
      .catch((err: unknown) => post({ type: 'error', message: err instanceof Error ? err.message : String(err) }));
  });
}
/* v8 ignore stop */
