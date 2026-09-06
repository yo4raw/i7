import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetchRetry, USER_AGENT } from '../../../scripts/lib/util.mjs';

// バックオフの待ち時間は実際に待たず、渡された秒数だけを観測する
vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));

const htmlResponse = (status: number) =>
  new Response('<!DOCTYPE html>\n<html><body>Something went wrong</body></html>', {
    status,
    headers: { 'content-type': 'text/html; charset=UTF-8' },
  });
const jsonResponse = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

describe('fetchRetry', () => {
  beforeEach(() => {
    vi.mocked(sleep).mockClear();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('403 の HTML が返っても再試行し、JSON が返ったらパース結果を返す', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(403))
      .mockResolvedValueOnce(htmlResponse(403))
      .mockResolvedValueOnce(jsonResponse({ cargoquery: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRetry('https://wiki.test/api.php', { json: true })).resolves.toEqual({
      cargoquery: [],
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('200 でも本文が JSON でなければ失敗として再試行する', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(htmlResponse(200))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRetry('https://wiki.test/api.php', { json: true })).resolves.toEqual({
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('3 回再試行しても失敗したら、ステータス・Content-Type・本文先頭を含むエラーで落ちる', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(htmlResponse(403)));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchRetry('https://wiki.test/api.php', { json: true })).rejects.toThrow(
      /HTTP 403 .*text\/html.*Something went wrong/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('再試行の待ち時間は 2 秒 → 4 秒 → 8 秒の指数バックオフ', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(fetchRetry('https://wiki.test/api.php')).rejects.toThrow(/fetch failed/);

    expect(vi.mocked(sleep).mock.calls.map(([ms]) => ms)).toEqual([2000, 4000, 8000]);
  });

  it('全リクエストに連絡先入りの User-Agent を付ける', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
    vi.stubGlobal('fetch', fetchMock);

    await fetchRetry('https://wiki.test/api.php', { json: true });

    expect(USER_AGENT).toMatch(/github\.com\/yo4raw\/i7/);
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ headers: { 'User-Agent': USER_AGENT } });
  });

  it('json を指定しなければ ok な Response をそのまま返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('jsonp(...)', { status: 200 })));

    const res = await fetchRetry('https://sheets.test/gviz');

    expect(res).toBeInstanceOf(Response);
    await expect(res.text()).resolves.toBe('jsonp(...)');
  });
});
