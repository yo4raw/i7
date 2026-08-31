// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { STORAGE_KEYS, BACKUP_EXCLUDED_KEYS, loadJson, saveJson, onSave } from '../../src/lib/storage';

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

describe('onSave', () => {
  it('保存に成功したキーを購読者へ通知する', () => {
    const seen: string[] = [];
    const unsubscribe = onSave((key) => seen.push(key));
    saveJson('i7_card_counts', { '1': 2 });
    expect(seen).toEqual(['i7_card_counts']);
    unsubscribe();
  });

  it('購読解除すると通知が止まる', () => {
    const seen: string[] = [];
    onSave((key) => seen.push(key))();
    saveJson('i7_card_counts', { '1': 2 });
    expect(seen).toEqual([]);
  });

  it('保存が失敗したときは通知しない (書けていない変更を同期対象にしない)', () => {
    const seen: string[] = [];
    const unsubscribe = onSave((key) => seen.push(key));
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    saveJson('i7_card_counts', { '1': 2 });
    expect(seen).toEqual([]);
    unsubscribe();
  });

  it('購読者が例外を投げても保存処理を壊さない', () => {
    const unsubscribe = onSave(() => { throw new Error('boom'); });
    expect(() => saveJson('i7_card_counts', { '1': 2 })).not.toThrow();
    expect(loadJson('i7_card_counts', {})).toEqual({ '1': 2 });
    unsubscribe();
  });
});

describe('BACKUP_EXCLUDED_KEYS', () => {
  it('同期メタとベースラインだけを除外する', () => {
    expect([...BACKUP_EXCLUDED_KEYS].toSorted()).toEqual(['i7_sync_baseline', 'i7_sync_meta']);
  });

  it('除外キーはすべて STORAGE_KEYS に存在する', () => {
    const all = new Set<string>(Object.values(STORAGE_KEYS));
    for (const key of BACKUP_EXCLUDED_KEYS) expect(all.has(key)).toBe(true);
  });
});
