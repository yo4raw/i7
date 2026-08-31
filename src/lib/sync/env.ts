/**
 * 同期機能の環境変数。どちらも公開前提の値で、ビルド時にクライアントへ埋め込まれる。
 *
 * 未設定のビルドでも失敗させないこと。Dependabot の PR は Actions Variables を
 * 参照できず（ADR 0061 により Dependabot は main 直行）、その CI ビルドは常に
 * 環境変数なしで走るため。未設定時は同期 UI ごと非表示にする。
 */
export type SyncEnv = { url: string; publishableKey: string };

export function readSyncEnv(env: Record<string, string | undefined>): SyncEnv | null {
  const url = env.PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = env.PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !publishableKey) return null;
  return { url, publishableKey };
}
