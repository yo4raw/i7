/// <reference lib="webworker" />
/**
 * max-score-finder 探索 Worker。
 * init で SearchContext を構築し、chunk を受けるたびに evaluateChunk を実行して
 * progress / result を返す。ロジックはすべて maxScoreFinder.ts (テスト済み) に委譲する。
 *
 * メッセージ処理本体は createWorkerHandler に切り出し（単体テスト対象）、
 * Worker グローバルへの結線のみブートストラップとして残す。
 */
import {
  createSearchContext,
  evaluateChunk,
  type FinderWorkerRequest,
  type FinderWorkerResponse,
  type SearchContext,
} from './maxScoreFinder';

export type WorkerPost = (msg: FinderWorkerResponse) => void;

/**
 * Worker メッセージハンドラを生成する。ctx / aborted を closure に閉じ込め、
 * post 関数経由で応答を返す純粋な関数として単体テストできる。
 */
export function createWorkerHandler(post: WorkerPost): (msg: FinderWorkerRequest) => Promise<void> {
  let ctx: SearchContext | null = null;
  let aborted = false;

  return async (msg: FinderWorkerRequest): Promise<void> => {
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
          await new Promise((r) => { setTimeout(r, 0); });
          return aborted;
        },
      });
      post({ type: 'result', topK: result.topK, evaluated: result.evaluated, aborted: result.aborted });
    } catch (err) {
      // async onmessage 内の throw は self.onerror を発火させないため、構造化してメインに通知する
      post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
    }
  };
}

/* v8 ignore start -- Worker ブートストラップ（実 Worker 環境専用、node 単体テスト不可） */
declare const self: DedicatedWorkerGlobalScope;
// node 単体テストで import しても落ちないよう Worker グローバル存在時のみ結線する
// oxlint-disable-next-line unicorn/no-typeof-undefined -- self はブラウザ/Worker専用グローバルで node には存在せず未宣言。`self !== undefined` は ReferenceError になるため typeof ガードが必須
if (typeof self !== 'undefined' && typeof self.postMessage === 'function') {
  const handle = createWorkerHandler((msg) => {
    // oxlint-disable-next-line unicorn/require-post-message-target-origin -- 専用 Worker (DedicatedWorkerGlobalScope) の self.postMessage に targetOrigin 引数は存在しない
    self.postMessage(msg);
  });
  self.addEventListener('message', (e: MessageEvent<FinderWorkerRequest>) => {
    void handle(e.data);
  });
}
/* v8 ignore stop */
