/// <reference lib="webworker" />
/**
 * max-score-finder 探索 Worker。
 * init で SearchContext を構築し、chunk を受けるたびに evaluateChunk を実行して
 * progress / result を返す。ロジックはすべて maxScoreFinder.ts (テスト済み) に委譲する。
 */
import {
  createSearchContext,
  evaluateChunk,
  type FinderWorkerRequest,
  type FinderWorkerResponse,
  type SearchContext,
} from './maxScoreFinder';

declare const self: DedicatedWorkerGlobalScope;

let ctx: SearchContext | null = null;
let aborted = false;

const post = (msg: FinderWorkerResponse): void => self.postMessage(msg);

self.onmessage = async (e: MessageEvent<FinderWorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'init') {
    ctx = createSearchContext(msg.input);
    aborted = false;
    post({ type: 'ready' });
    return;
  }

  if (msg.type === 'abort') {
    aborted = true;
    return;
  }

  // msg.type === 'chunk'
  if (!ctx) return;
  try {
    const result = await evaluateChunk(ctx, msg.descriptor, {
      onTick: async (evaluatedDelta, localBest) => {
        post({ type: 'progress', evaluatedDelta, localBestScore: localBest?.score ?? null });
        // マクロタスクで yield してメッセージループに制御を返し、
        // キュー済みの abort メッセージを処理させる (Promise.resolve() では不可)
        await new Promise((r) => setTimeout(r, 0));
        return aborted;
      },
    });
    post({ type: 'result', topK: result.topK, evaluated: result.evaluated, aborted: result.aborted });
  } catch (err) {
    // async onmessage 内の throw は self.onerror を発火させないため、構造化してメインに通知する
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
