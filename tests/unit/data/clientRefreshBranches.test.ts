// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { refreshData } from '../../../src/lib/data/clientRefresh';

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('refreshData: 並行フェッチでの pendingCount 分岐 (L92, L105)', () => {
  it('2 件同時フェッチでは 2 件目の pendingCount===1 が false、先終了側の ===0 も false', async () => {
    // fetchFn を手動 resolve できる Promise にして 2 件を同時 in-flight にする。
    let resolveA!: (v: unknown[]) => void;
    let resolveB!: (v: unknown[]) => void;
    const fetchA = vi.fn(() => new Promise<unknown[]>((res) => { resolveA = res; }));
    const fetchB = vi.fn(() => new Promise<unknown[]>((res) => { resolveB = res; }));

    const onA = vi.fn();
    const onB = vi.fn();

    // どちらもキャッシュミス → 両方が pendingCount をインクリメント
    const pA = refreshData('cards', fetchA as never, onA);
    const pB = refreshData('songs', fetchB as never, onB);

    // この時点で pendingCount=2 (2 件目の `=== 1` は false 経路を通過済み)
    // 先に A を終了させる → pendingCount は 2→1 (`=== 0` が false の経路を通過)
    resolveA([{ id: 1 }]);
    await pA;
    expect(onA).toHaveBeenCalledWith([{ id: 1 }]);

    // B を終了 → pendingCount 1→0 で成功インジケータが出る
    resolveB([{ id: 2 }]);
    await pB;
    expect(onB).toHaveBeenCalledWith([{ id: 2 }]);

    const el = document.getElementById('data-freshness-indicator');
    expect(el?.textContent).toBe('最新データに更新済み');
  });
});
