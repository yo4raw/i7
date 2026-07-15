// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { refreshData } from '../../../src/lib/data/clientRefresh';

const CACHE_PREFIX = 'i7_fresh_';

beforeEach(() => {
  sessionStorage.clear();
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('refreshData', () => {
  it('有効なキャッシュがあれば fetchFn を呼ばず onUpdate にキャッシュを渡す', async () => {
    sessionStorage.setItem(
      CACHE_PREFIX + 'cards',
      JSON.stringify({ data: [{ id: 1 }], ts: Date.now() }),
    );
    const fetchFn = vi.fn(() => Promise.resolve([{ id: 999 }]));
    const onUpdate = vi.fn();
    await refreshData('cards', fetchFn, onUpdate);
    expect(fetchFn).not.toHaveBeenCalled();
    expect(onUpdate).toHaveBeenCalledWith([{ id: 1 }]);
  });

  it('キャッシュなしならフェッチして onUpdate・キャッシュ書込・インジケータ表示', async () => {
    const fresh = [{ id: 2 }];
    const onUpdate = vi.fn();
    await refreshData('songs', () => Promise.resolve(fresh), onUpdate);
    expect(onUpdate).toHaveBeenCalledWith(fresh);
    // sessionStorage に書き込まれている
    const cached = JSON.parse(sessionStorage.getItem(CACHE_PREFIX + 'songs')!);
    expect(cached.data).toEqual(fresh);
    // 成功インジケータが DOM に出る
    const el = document.querySelector('#data-freshness-indicator');
    expect(el?.textContent).toBe('最新データに更新済み');
    // 3秒後にフェードアウト
    vi.advanceTimersByTime(3000);
    expect(el?.className).toContain('opacity-0');
  });

  it('期限切れキャッシュはミス扱いでフェッチする', async () => {
    sessionStorage.setItem(
      CACHE_PREFIX + 'broachs',
      JSON.stringify({ data: [{ id: 1 }], ts: Date.now() - 10 * 60 * 1000 }),
    );
    const fetchFn = vi.fn(() => Promise.resolve([{ id: 2 }]));
    await refreshData('broachs', fetchFn, vi.fn(), { maxAgeMs: 5 * 60 * 1000 });
    expect(fetchFn).toHaveBeenCalled();
  });

  it('壊れたキャッシュ JSON はミス扱い', async () => {
    sessionStorage.setItem(CACHE_PREFIX + 'cards', '{broken');
    const fetchFn = vi.fn(() => Promise.resolve([{ id: 3 }]));
    await refreshData('cards', fetchFn, vi.fn());
    expect(fetchFn).toHaveBeenCalled();
  });

  it('フェッチ失敗時は onUpdate を呼ばず握りつぶす', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const onUpdate = vi.fn();
    await refreshData('cards', () => { throw new Error('network'); }, onUpdate);
    expect(onUpdate).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalled();
  });
});
