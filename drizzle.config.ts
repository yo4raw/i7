import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './drizzle',
  // Supabase 管理下の auth スキーマを管理対象にしないこと。
  // これがないと migration に auth への破壊的変更が混入しうる (ADR 0064 決定 9)。
  schemaFilter: ['public'],
  // 注意: `drizzle-kit push` / `drizzle-kit pull` はこのプロジェクトで実行禁止。
  // sync_cursor テーブルと next_rev/set_rev/bump_deck_rev/upsert_deck/
  // delete_all_sync_data 関数・トリガーは drizzle/0001_sync_rev_and_rpc.sql の
  // 手書き migration にしか定義がなく、drizzle/meta/ のスナップショットは
  // それらを関知していない。push はスナップショットにないオブジェクトを
  // 「管理対象外」とみなし DROP を提案しうる。許可されているのは
  // `drizzle-kit generate` のみ。
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
