/* v8 ignore start -- 実 Supabase への接続のみ。判定ロジックは env.ts 側でテストしている */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readSyncEnv } from './env';

let cached: SupabaseClient | null | undefined;

/**
 * 環境変数が未設定なら null を返す。呼び出し側は null のとき同期 UI を描画しないこと。
 *
 * detectSessionInUrl: フッターの島は全ページに存在するため、OAuth から戻った
 * どのページでも ?code= を処理できる。専用のコールバックページは作らない。
 */
export function getSupabaseClient(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const env = readSyncEnv(import.meta.env as unknown as Record<string, string | undefined>);
  cached = env
    ? createClient(env.url, env.publishableKey, {
        auth: {
          detectSessionInUrl: true,
          flowType: 'pkce',
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;
  return cached;
}
/* v8 ignore stop */
