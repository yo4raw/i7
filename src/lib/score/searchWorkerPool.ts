/**
 * max-score-finder の探索 Worker プール制御。
 * Worker 生成・chunk dispatch・進捗集約・abort・terminate を担い、
 * 進捗の表示計算（％・テキスト生成）や結果のマージは呼び出し元に委ねる。
 */
import type {
  ChunkDescriptor,
  DeckRecord,
  FinderWorkerResponse,
  SearchInput,
} from './maxScoreFinder';

export interface SearchPoolOutcome {
  /** 各 chunk の topK（呼び出し元で mergeTopK する） */
  localTops: DeckRecord[][];
  evaluated: number;
  aborted: boolean;
}

export interface SearchPoolRun {
  promise: Promise<SearchPoolOutcome>;
  /** 全 Worker に abort メッセージを送る（既存 requestAbort と同じ動き） */
  abort: () => void;
  /** 即時に全 Worker を terminate する（コンポーネント破棄時用） */
  terminate: () => void;
}

export function startWorkerSearch(
  input: SearchInput,
  chunks: ChunkDescriptor[],
  workerCount: number,
  onProgress: (evaluatedTotal: number, provisionalBestScore: number | null) => void,
): SearchPoolRun {
  let evaluated = 0;
  let provisionalBest: number | null = null;
  const localTops: DeckRecord[][] = [];
  let anyAborted = false;
  let abortRequested = false;
  const workers: Worker[] = [];

  const promise = (async (): Promise<SearchPoolOutcome> => {
    try {
      await new Promise<void>((resolve, reject) => {
        if (chunks.length === 0) { resolve(); return; }
        let nextChunk = 0;
        let active = 0;

        const dispatch = (w: Worker) => {
          if (abortRequested || nextChunk >= chunks.length) {
            if (active === 0) resolve();
            return;
          }
          active++;
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- 専用 Worker#postMessage に targetOrigin 引数は存在しない (Window#postMessage 専用の引数)
          w.postMessage({ type: 'chunk', descriptor: chunks[nextChunk++] });
        };

        // Worker 生成ループの外で定義し、ループ内では参照のみ渡す (no-loop-func 対策)。
        // handleWorkerMessage は w ごとに専用クロージャを返すファクトリ。
        const handleWorkerError = (e: ErrorEvent) => {
          reject(new Error(`探索 Worker でエラーが発生しました: ${e.message}`));
        };
        const handleWorkerMessage = (w: Worker) => (e: MessageEvent<FinderWorkerResponse>) => {
          const msg = e.data;
          if (msg.type === 'ready') {
            dispatch(w);
            return;
          }
          if (msg.type === 'progress') {
            evaluated += msg.evaluatedDelta;
            if (msg.localBestScore !== null && (provisionalBest === null || msg.localBestScore > provisionalBest)) {
              provisionalBest = msg.localBestScore;
            }
            onProgress(evaluated, provisionalBest);
            return;
          }
          if (msg.type === 'error') {
            reject(new Error(`探索 Worker でエラーが発生しました: ${msg.message}`));
            return;
          }
          // msg.type === 'result'
          localTops.push(msg.topK);
          if (msg.aborted) anyAborted = true;
          active--;
          dispatch(w);
        };

        for (let i = 0; i < workerCount; i++) {
          const w = new Worker(
            new URL('./maxScoreFinder.worker.ts', import.meta.url),
            { type: 'module' },
          );
          workers.push(w);
          w.addEventListener('error', handleWorkerError);
          w.addEventListener('message', handleWorkerMessage(w));
          // oxlint-disable-next-line unicorn/require-post-message-target-origin -- 専用 Worker#postMessage に targetOrigin 引数は存在しない (Window#postMessage 専用の引数)
          w.postMessage({ type: 'init', input });
        }
      });
      return { localTops, evaluated, aborted: abortRequested || anyAborted };
    } finally {
      for (const w of workers) w.terminate();
      workers.length = 0;
    }
  })();

  return {
    promise,
    abort: () => {
      abortRequested = true;
      for (const w of workers) {
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- 専用 Worker#postMessage に targetOrigin 引数は存在しない (Window#postMessage 専用の引数)
        w.postMessage({ type: 'abort' });
      }
    },
    terminate: () => {
      for (const w of workers) w.terminate();
      workers.length = 0;
    },
  };
}
