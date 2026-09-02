import { describe, it, expect } from 'vitest';
import { readSyncEnv } from '../../../src/lib/sync/env';

describe('readSyncEnv', () => {
  it('URL とキーが揃っていれば設定を返す', () => {
    expect(
      readSyncEnv({
        PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_dummy',
      }),
    ).toEqual({ url: 'https://example.supabase.co', publishableKey: 'sb_publishable_dummy' });
  });

  it('前後の空白を落とす', () => {
    expect(
      readSyncEnv({
        PUBLIC_SUPABASE_URL: '  https://example.supabase.co  ',
        PUBLIC_SUPABASE_PUBLISHABLE_KEY: ' k ',
      }),
    ).toEqual({ url: 'https://example.supabase.co', publishableKey: 'k' });
  });

  it('URL が欠けていれば null', () => {
    expect(readSyncEnv({ PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
  });

  it('キーが欠けていれば null', () => {
    expect(readSyncEnv({ PUBLIC_SUPABASE_URL: 'https://example.supabase.co' })).toBeNull();
  });

  it('空文字・空白のみは未設定として扱う', () => {
    expect(readSyncEnv({ PUBLIC_SUPABASE_URL: '   ', PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'k' })).toBeNull();
    expect(readSyncEnv({ PUBLIC_SUPABASE_URL: 'u', PUBLIC_SUPABASE_PUBLISHABLE_KEY: '' })).toBeNull();
    expect(readSyncEnv({})).toBeNull();
  });
});
