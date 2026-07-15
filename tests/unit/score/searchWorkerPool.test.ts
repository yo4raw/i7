import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startWorkerSearch } from '../../../src/lib/score/searchWorkerPool';

/**
 * 設定可能なモック Worker。init→ready、chunk→progress+result を駆動する。
 * 実装側 (searchWorkerPool.ts) が addEventListener('message'|'error', ...) で購読するのに合わせ、
 * onmessage/onerror プロパティではなくリスナー配列で通知する。
 */
class MockWorker {
  static instances: MockWorker[] = [];
  static mode: 'ok' | 'error' | 'silent' = 'ok';
  private messageListeners: ((e: { data: unknown }) => void)[] = [];
  private errorListeners: ((e: { message: string }) => void)[] = [];
  posted: { type: string; [k: string]: unknown }[] = [];
  terminated = false;

  constructor() {
    MockWorker.instances.push(this);
  }

  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (e: { message: string }) => void): void;
  // overload 実装シグネチャ。呼び出し側は上記の型付きシグネチャのみ見える（any は oxlint の有効ルール対象外）
  addEventListener(type: 'message' | 'error', listener: (e: any) => void): void {
    if (type === 'message') this.messageListeners.push(listener);
    else this.errorListeners.push(listener);
  }

  // removeEventListener は本テストでは未使用のため簡易型で十分（any は oxlint の有効ルール対象外）
  removeEventListener(type: 'message' | 'error', listener: (e: any) => void): void {
    if (type === 'message') this.messageListeners = this.messageListeners.filter((l) => l !== listener);
    else this.errorListeners = this.errorListeners.filter((l) => l !== listener);
  }

  /** テストから直接 error イベントを発火させるヘルパー（実 Worker の onerror 発火を模す） */
  fireError(e: { message: string }): void {
    for (const l of this.errorListeners) l(e);
  }

  private emitMessage(data: unknown): void {
    for (const l of this.messageListeners) l({ data });
  }

  postMessage(msg: { type: string; descriptor?: unknown }): void {
    this.posted.push(msg);
    if (MockWorker.mode === 'silent') return;
    queueMicrotask(() => {
      if (this.terminated) return;
      if (msg.type === 'init') {
        this.emitMessage({ type: 'ready' });
      } else if (msg.type === 'chunk') {
        if (MockWorker.mode === 'error') {
          this.emitMessage({ type: 'error', message: 'worker boom' });
          return;
        }
        this.emitMessage({ type: 'progress', evaluatedDelta: 10, localBestScore: 50 });
        this.emitMessage({ type: 'result', topK: [{ d: msg.descriptor }], evaluated: 10, aborted: false });
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
    // 生成された Worker の error イベントを発火
    MockWorker.instances[0].fireError({ message: 'crash' });
    await expect(run.promise).rejects.toThrow(/エラー/);
  });

  it('abort() は全 Worker に abort を送る', () => {
    MockWorker.mode = 'silent';
    const run = startWorkerSearch(input, chunks, 2, vi.fn());
    run.abort();
    expect(MockWorker.instances).toHaveLength(2);
    expect(MockWorker.instances.every((w) => w.posted.some((m) => m.type === 'abort'))).toBe(true);
    run.terminate(); // ハングしている promise の後始末
  });

  it('terminate() は全 Worker を terminate する', () => {
    MockWorker.mode = 'silent';
    const run = startWorkerSearch(input, chunks, 2, vi.fn());
    run.terminate();
    expect(MockWorker.instances.every((w) => w.terminated)).toBe(true);
  });
});
