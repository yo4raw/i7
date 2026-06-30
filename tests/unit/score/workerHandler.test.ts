import { describe, it, expect, vi, beforeEach } from 'vitest';

// maxScoreFinder の重い探索ロジックはモックし、ハンドラの制御フローのみ検証する
vi.mock('../../../src/lib/score/maxScoreFinder', () => ({
  createSearchContext: vi.fn((input) => ({ ctx: true, input })),
  evaluateChunk: vi.fn(),
}));

import { createWorkerHandler } from '../../../src/lib/score/maxScoreFinder.worker';
import { createSearchContext, evaluateChunk } from '../../../src/lib/score/maxScoreFinder';

type AnyMsg = Parameters<ReturnType<typeof createWorkerHandler>>[0];
const initMsg = { type: 'init', input: { foo: 1 } } as unknown as AnyMsg;
const chunkMsg = { type: 'chunk', descriptor: { start: 0, end: 10 } } as unknown as AnyMsg;
const abortMsg = { type: 'abort' } as unknown as AnyMsg;

beforeEach(() => vi.clearAllMocks());

describe('createWorkerHandler', () => {
  it('init で SearchContext を作り ready を返す', async () => {
    const post = vi.fn();
    const handle = createWorkerHandler(post);
    await handle(initMsg);
    expect(createSearchContext).toHaveBeenCalledWith({ foo: 1 });
    expect(post).toHaveBeenCalledWith({ type: 'ready' });
  });

  it('init 前の chunk は無視（ctx null）', async () => {
    const post = vi.fn();
    const handle = createWorkerHandler(post);
    await handle(chunkMsg);
    expect(evaluateChunk).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it('chunk で progress と result を返す', async () => {
    vi.mocked(evaluateChunk).mockImplementation(async (_ctx, _desc, opts) => {
      await opts!.onTick!(5, { score: 100 } as never);
      await opts!.onTick!(3, null as never); // localBest null の分岐
      return { topK: [{ id: 1 }], evaluated: 8, aborted: false } as never;
    });
    const post = vi.fn();
    const handle = createWorkerHandler(post);
    await handle(initMsg);
    await handle(chunkMsg);

    expect(post).toHaveBeenCalledWith({ type: 'progress', evaluatedDelta: 5, localBestScore: 100 });
    expect(post).toHaveBeenCalledWith({ type: 'progress', evaluatedDelta: 3, localBestScore: null });
    expect(post).toHaveBeenCalledWith({ type: 'result', topK: [{ id: 1 }], evaluated: 8, aborted: false });
  });

  it('abort 後の chunk では onTick が中断シグナル(true)を返す', async () => {
    let tickResult: boolean | undefined;
    vi.mocked(evaluateChunk).mockImplementation(async (_ctx, _desc, opts) => {
      tickResult = await opts!.onTick!(1, null as never);
      return { topK: [], evaluated: 1, aborted: tickResult } as never;
    });
    const post = vi.fn();
    const handle = createWorkerHandler(post);
    await handle(initMsg);
    await handle(abortMsg); // aborted = true
    await handle(chunkMsg);
    expect(tickResult).toBe(true);
    expect(post).toHaveBeenCalledWith(expect.objectContaining({ type: 'result', aborted: true }));
  });

  it('evaluateChunk が Error を throw したら message を構造化して返す', async () => {
    vi.mocked(evaluateChunk).mockRejectedValue(new Error('boom'));
    const post = vi.fn();
    const handle = createWorkerHandler(post);
    await handle(initMsg);
    await handle(chunkMsg);
    expect(post).toHaveBeenCalledWith({ type: 'error', message: 'boom' });
  });

  it('evaluateChunk が非 Error を throw したら String(err) を返す', async () => {
    vi.mocked(evaluateChunk).mockRejectedValue('plain string error');
    const post = vi.fn();
    const handle = createWorkerHandler(post);
    await handle(initMsg);
    await handle(chunkMsg);
    expect(post).toHaveBeenCalledWith({ type: 'error', message: 'plain string error' });
  });
});
