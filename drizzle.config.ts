import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './db/schema.ts',
  out: './drizzle',
  // Supabase 管理下の auth スキーマを管理対象にしないこと。
  // これがないと migration に auth への破壊的変更が混入しうる (ADR 0064 決定 9)。
  schemaFilter: ['public'],
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
