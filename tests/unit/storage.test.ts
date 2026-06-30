// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS, loadJson, saveJson } from '../../src/lib/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('STORAGE_KEYS', () => {
  it('全キーが i7_ プレフィックスの一意な文字列', () => {
    const keys = Object.values(STORAGE_KEYS);
    expect(keys.every((k) => k.startsWith('i7_'))).toBe(true);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('loadJson', () => {
  it('保存済み JSON をパースして返す', () => {
    localStorage.setItem('k', JSON.stringify({ a: 1 }));
    expect(loadJson('k', { a: 0 })).toEqual({ a: 1 });
  });

  it('キー未存在なら fallback', () => {
    const fb = { x: 1 };
    expect(loadJson('missing', fb)).toBe(fb);
  });

  it('不正な JSON なら fallback（例外を握りつぶす）', () => {
    localStorage.setItem('bad', '{not json');
    const fb = { ok: true };
    expect(loadJson('bad', fb)).toBe(fb);
  });
});

describe('saveJson', () => {
  it('値を JSON 文字列化して保存', () => {
    saveJson('k', { a: 1 });
    expect(JSON.parse(localStorage.getItem('k')!)).toEqual({ a: 1 });
  });

  it('setItem が例外を投げても握りつぶす（quota 超過想定）', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveJson('k', { a: 1 })).not.toThrow();
  });
});
