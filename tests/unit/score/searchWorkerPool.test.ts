import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startWorkerSearch } from '../../../src/lib/score/searchWorkerPool';

/** 設定可能なモック Worker。init→ready、chunk→progress+result を駆動する。 */
class MockWorker {
  static instances: MockWorker[] = [];
  static mode: 'ok' | 'error' | 'silent' = 'ok';
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onerror: ((e: { message: string }) => void) | null = null;
  posted: { type: string; [k: string]: unknown }[] = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  postMessage(msg: { type: string; descriptor?: unknown }): void {
    this.posted.push(msg);
    if (MockWorker.mode === 'silent') return;
    queueMicrotask(() => {
      if (this.terminated) return;
      if (msg.type === 'init') {
        this.onmessage?.({ data: { type: 'ready' } });
      } else if (msg.type === 'chunk') {
        if (MockWorker.mode === 'error') {
          this.onmessage?.({ data: { type: 'error', message: 'worker boom' } });
          return;
        }
        this.onmessage?.({ data: { type: 'progress', evaluatedDelta: 10, localBestScore: 50 } });
        this.onmessage?.({
          data: { type: 'result', topK: [{ d: msg.descriptor }], evaluated: 10, aborted: false },
        });
      }
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

const input = { foo: 1 } as never;
const chunks = [{ i: 0 }, { i: 1 }, { i: 2 }] as never[];

beforeEach(() => {
  MockWorker.instances = [];
  MockWorker.mode = 'ok';
  vi.stubGlobal('Worker', MockWorker as unknown as typeof Worker);
});

afterEach(() => vi.unstubAllGlobals());

describe('startWorkerSearch', () => {
  it('chunk を分散処理し localTops と evaluated を集約する', async () => {
    const onProgress = vi.fn();
    const run = startWorkerSearch(input, chunks, 2, onProgress);
    const outcome = await run.promise;
    expect(outcome.localTops).toHaveLength(3);
    expect(outcome.evaluated).toBe(30);
    expect(outcome.aborted).toBe(false);
    expect(onProgress).toHaveBeenCalledWith(expect.any(Number), 50);
    // 各 Worker は最後に terminate される
    expect(MockWorker.instances.every((w) => w.terminated)).toBe(true);
  });

  it('chunks 空なら即解決し localTops 空', async () => {
    const outcome = await startWorkerSearch(input, [], 2, vi.fn()).promise;
    expect(outcome.localTops).toEqual([]);
    expect(outcome.evaluated).toBe(0);
  });

  it('Worker が error を返したら reject する', async () => {
    MockWorker.mode = 'error';
    const run = startWorkerSearch(input, chunks, 1, vi.fn());
    await expect(run.promise).rejects.toThrow(/エラー/);
  });

  it('onerror でも reject する', async () => {
    MockWorker.mode = 'silent'; // 自動応答させない
    const run = startWorkerSearch(input, chunks, 1, vi.fn());
    // 生成された Worker の onerror を発火
    MockWorker.instances[0].onerror?.({ message: 'crash' });
    await expect(run.promise).rejects.toThrow(/エラー/);
  });

  it('abort() は全 Worker に abort を送る', async () => {
    MockWorker.mode = 'silent';
    const run = startWorkerSearch(input, chunks, 2, vi.fn());
    run.abort();
    expect(MockWorker.instances).toHaveLength(2);
    expect(MockWorker.instances.every((w) => w.posted.some((m) => m.type === 'abort'))).toBe(true);
    run.terminate(); // ハングしている promise の後始末
  });

  it('terminate() は全 Worker を terminate する', async () => {
    MockWorker.mode = 'silent';
    const run = startWorkerSearch(input, chunks, 2, vi.fn());
    run.terminate();
    expect(MockWorker.instances.every((w) => w.terminated)).toBe(true);
  });
});
