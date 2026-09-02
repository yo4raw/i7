/* v8 ignore start -- 実 Supabase への接続のみ。判定ロジックは env.ts 側でテストしている */
import type { SupabaseClient } from '@supabase/supabase-js';
import { readSyncEnv } from './env';

let cached: SupabaseClient | null | undefined;

/**
 * 環境変数が未設定なら null を返す。呼び出し側は null のとき同期 UI を描画しないこと。
 *
 * `@supabase/supabase-js`（auth-js + realtime-js + phoenix + postgrest-js +
 * functions-js + storage-js、gzip で約 148KB）は動的 import にする。
 * ログインしない大多数の訪問者に配らないため、呼び出し側は本当に必要になるまで
 * （既存セッションがある／OAuth から戻った／利用者がログインを押した）これを呼ばないこと。
 *
 * detectSessionInUrl: フッターの島は全ページに存在するため、OAuth から戻った
 * どのページでも ?code= を処理できる。専用のコールバックページは作らない。
 */
export async function getSupabaseClient(): Promise<SupabaseClient | null> {
  if (cached !== undefined) return cached;
  const env = readSyncEnv(import.meta.env as unknown as Record<string, string | undefined>);
  if (env === null) {
    cached = null;
    return null;
  }
  const { createClient } = await import('@supabase/supabase-js');
  cached = createClient(env.url, env.publishableKey, {
    auth: { detectSessionInUrl: true, flowType: 'pkce', persistSession: true, autoRefreshToken: true },
  });
  return cached;
}
/* v8 ignore stop */
