# Supabase 端末間同期 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google ログインで所持衣装・ラビットノート・共通ブローチ・保存デッキを Supabase 経由で端末間同期できるようにする。

**Architecture:** 完全静的サイトのまま、ブラウザから supabase-js（PostgREST + RLS）を叩く。データは 5 テーブルに正規化し、サーバ側の単調増加カウンタ `rev` で増分プル、クライアント側のベースラインで 3-way マージする。同期ロジックは `SyncPort` という狭いインターフェースに依存する純関数群として実装し、実 Supabase なしで単体テストできるようにする。

**Tech Stack:** Astro 7 / Svelte 5 (runes) / Tailwind CSS v4 / `@supabase/supabase-js` / Drizzle ORM（スキーマと migration 生成のみ）/ Vitest / Playwright

**Spec:** `docs/superpowers/specs/2026-08-31-supabase-deck-sync-design.md`（ADR: `docs/adr/0064-supabase-server-sync.md`）

## 前提条件（実装前に完了していること）

**issue #446 の手作業が終わっていなくても Task 1〜13 は実装・テストできる。** 実 Supabase に接続する動作確認（Task 14 の手動確認）だけがブロックされる。

- Supabase プロジェクト `agvydeewvkmtxvdfluyf`（Tokyo `ap-northeast-1`）
- Site URL / Redirect URLs は設定済み
- GitHub Actions Variables に `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY` を登録済み
- ローカル `.env` に同 2 つを記載済み
- **未完了（issue #446）**: Google OAuth の Client ID / Secret、migration 適用用の `DATABASE_URL`

## Global Constraints

- **同期は純粋な付加機能である。** Supabase が落ちていても、環境変数が未設定でも、未ログインでも、サイトの全機能は localStorage のみで従来通り動作しなければならない。同期層を丸ごと削除しても既存機能が無傷であること。
- **既存の 13 箇所の `saveJson` 呼び出しを変更してはならない。** 変更検知は `storage.ts` のフック 1 箇所で行う。
- **Drizzle は型と migration 生成にのみ使う。** `src/` からは `import type` のみ。実行時クエリは supabase-js。
- **TS のプロパティ名は列名と一致させ snake_case にする。** `casing: 'snake_case'` オプションは使わない。
- **ベースラインの更新は行単位に限る。** 一括更新は禁止（部分失敗時の再送がこの粒度に依存している）。
- Node.js 22（`.nvmrc`）。ホストで直接 npm scripts を実行する。Docker は使わない。
- **ユーザー可視テキストでは「カード」ではなく「衣装」**、共有ブローチは「共通ブローチ」。内部識別子は `card` / `broach` のまま。
- 命名: イベント変数は `event`、ブローチは `broach`、スロット index は `slotIndex`。
- ライトテーマ固定。`dark:` バリアントを付けてはならない。
- **ADR 0047**: 構造・ナビの配色は無彩色（近黒 `#14151A` / 白 / グレー階調）。`indigo` をクラス名・HEX とも増やしてはならない（`tests/unit/noIndigo.test.ts` がガードしている）。
- **ADR 0048**: ネイティブ `confirm()` / `alert()` は使わない。z-index は既存スケール（`z-(--z-overlay)` 等）のみ。
- **ADR 0055**: E2E の `test` / `expect` は `@playwright/test` ではなく `tests/helpers/fixtures.ts` から import する。
- **カバレッジ**: `vitest.config.ts` の coverage は `include: ['src/lib/**']`、しきい値 95%（statements / branches / functions / lines）。`db/**` は元から対象外なので設定変更は不要。実接続しか行わない `supabaseClient.ts` / `supabasePort.ts` は `/* v8 ignore */` で除外する。
- 作業ブランチは `develop` から切る。PR の base も `develop`。

## File Structure

**新規（`src/lib/sync/` に閉じ込める。ここを削除すれば同期機能が消え、既存機能は無傷）**

| パス | 責務 |
|---|---|
| `db/schema.ts` | Drizzle スキーマ。テーブルと RLS ポリシーの単一情報源 |
| `drizzle.config.ts` | `out: './drizzle'`、`schemaFilter: ['public']` |
| `drizzle/` | 生成された migration（commit する） |
| `src/lib/sync/env.ts` | 環境変数の読み出し（純関数） |
| `src/lib/sync/supabaseClient.ts` | supabase-js client の遅延生成。未設定なら `null` |
| `src/lib/sync/rows.ts` | 行の型（Drizzle から `InferSelectModel` で導出） |
| `src/lib/sync/projection/countMap.ts` | `Record<string, number>` ⇄ 行（所持衣装数・共通ブローチ兼用） |
| `src/lib/sync/projection/rabbitNotes.ts` | `RabbitNoteMap` ⇄ 行 |
| `src/lib/sync/projection/decks.ts` | `SavedDeck[]` ⇄ デッキ行 + スロット行 |
| `src/lib/sync/diff.ts` | ベースラインと現在の 2-way 差分 |
| `src/lib/sync/merge.ts` | 3-way 判定（push / adopt / conflict / noop） |
| `src/lib/sync/baseline.ts` | ベースラインの永続化 |
| `src/lib/sync/syncMeta.ts` | `{ userId, cursorRev, lastSyncedAt }` の永続化とカーソル計算 |
| `src/lib/sync/port.ts` | `SyncPort` インターフェース（型のみ） |
| `src/lib/sync/supabasePort.ts` | `SyncPort` の supabase-js 実装。ここだけが PostgREST を知る |
| `src/lib/sync/syncEngine.ts` | pull / push のオーケストレーション |
| `src/components/SyncPanel.svelte` | フッターの同期 UI。OAuth コールバック処理も担う |
| `src/pages/privacy/index.astro` | プライバシーポリシー（index 対象） |
| `.github/workflows/keep-supabase-awake.yml` | 週次 cron。7 日間無アクセス停止の予防 |

**既存への変更**

| パス | 変更 |
|---|---|
| `package.json` | 依存追加 |
| `src/lib/storage.ts` | `onSave` フック、`STORAGE_KEYS` へ 2 キー追加、`BACKUP_EXCLUDED_KEYS` |
| `src/components/FooterTools.svelte` | エクスポート除外、インポート後の同期状態リセット |
| `src/components/ui/ModalDialog.svelte` | `choose`（3 択）を加算的に追加 |
| `src/layouts/BaseLayout.astro` | `SyncPanel` の島を追加 |
| `src/lib/seo.ts` | `PAGE_DESCRIPTIONS.privacy` |
| `CLAUDE.md` | 設計原則の例外・Drizzle 運用・`BACKUP_EXCLUDED_KEYS` を追記 |

---

### Task 1: 依存追加と環境変数の読み出し

**Files:**
- Modify: `package.json`
- Create: `src/lib/sync/env.ts`
- Create: `src/lib/sync/supabaseClient.ts`
- Test: `tests/unit/sync/env.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `type SyncEnv = { url: string; publishableKey: string }`
  - `readSyncEnv(env: Record<string, string | undefined>): SyncEnv | null`
  - `getSupabaseClient(): SupabaseClient | null`

- [ ] **Step 1: 依存を追加する**

```bash
npm install @supabase/supabase-js
npm install --save-dev drizzle-orm drizzle-kit
```

`drizzle-orm` を devDependencies に置くのは、`src/` からは `import type` のみで参照しクライアントバンドルに含めないため。

- [ ] **Step 2: 失敗するテストを書く**

`tests/unit/sync/env.test.ts`:

```ts
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
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/env.test.ts`
Expected: FAIL（`Failed to resolve import "../../../src/lib/sync/env"`）

- [ ] **Step 4: `env.ts` を実装する**

`src/lib/sync/env.ts`:

```ts
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
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/env.test.ts`
Expected: PASS（5 tests）

- [ ] **Step 6: `supabaseClient.ts` を実装する**

`src/lib/sync/supabaseClient.ts`:

```ts
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
```

- [ ] **Step 7: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 8: commit**

```bash
git add package.json package-lock.json src/lib/sync/env.ts src/lib/sync/supabaseClient.ts tests/unit/sync/env.test.ts
git commit -m "feat(sync): Supabase client と環境変数の読み出しを追加する (ADR 0064)"
```

---

### Task 2: Drizzle スキーマと migration

**Files:**
- Create: `drizzle.config.ts`
- Create: `db/schema.ts`
- Create: `drizzle/` 配下（`drizzle-kit generate` が生成）
- Test: `tests/unit/sync/schema.test.ts`

**Interfaces:**
- Consumes: なし
- Produces: `card_counts` / `rabbit_notes` / `shared_broach_counts` / `decks` / `deck_slots` の 5 テーブル（`db/schema.ts` から named export）

- [ ] **Step 1: `drizzle.config.ts` を作る**

```ts
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
```

- [ ] **Step 2: `db/schema.ts` を書く**

```ts
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint, boolean, check, foreignKey, integer, pgPolicy, pgTable,
  primaryKey, smallint, text, timestamp, uuid,
} from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';

// timestamp は必ず mode: 'string' にする。既定モードは InferSelectModel が Date を返すが、
// 実行時は PostgREST が ISO 文字列を返すため、型と実際の値が食い違ってしまう。

/**
 * 自分の行だけを読み書きできる 4 ポリシーを生成する。
 * ポリシーを 1 つでも定義したテーブルは Drizzle が RLS を自動で有効化する。
 */
function ownerPolicies(name: string, userId: AnyPgColumn) {
  const own = sql`${userId} = ${authUid}`;
  return [
    pgPolicy(`${name}_select`, { for: 'select', to: authenticatedRole, using: own }),
    pgPolicy(`${name}_insert`, { for: 'insert', to: authenticatedRole, withCheck: own }),
    pgPolicy(`${name}_update`, { for: 'update', to: authenticatedRole, using: own, withCheck: own }),
    pgPolicy(`${name}_delete`, { for: 'delete', to: authenticatedRole, using: own }),
  ];
}

/** 所持衣装数。行を削除せず 0 を保持するため tombstone は不要 (ADR 0064 決定 4) */
export const card_counts = pgTable('card_counts', {
  user_id: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  card_id: integer('card_id').notNull(),
  count: integer('count').notNull(),
  rev: bigint('rev', { mode: 'number' }).notNull().default(0),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.card_id] }),
  check('card_counts_count_range', sql`${t.count} >= 0`),
  ...ownerPolicies('card_counts', t.user_id),
]);

/** 共通ブローチ所持数 */
export const shared_broach_counts = pgTable('shared_broach_counts', {
  user_id: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  broach_id: integer('broach_id').notNull(),
  count: integer('count').notNull(),
  rev: bigint('rev', { mode: 'number' }).notNull().default(0),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.broach_id] }),
  check('shared_broach_counts_count_range', sql`${t.count} >= 0`),
  ...ownerPolicies('shared_broach_counts', t.user_id),
]);

/** ラビットノート。キーはキャラクター名 */
export const rabbit_notes = pgTable('rabbit_notes', {
  user_id: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  character: text('character').notNull(),
  shout: integer('shout').notNull(),
  beat: integer('beat').notNull(),
  melody: integer('melody').notNull(),
  rev: bigint('rev', { mode: 'number' }).notNull().default(0),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.character] }),
  check('rabbit_notes_character_len', sql`char_length(${t.character}) between 1 and 40`),
  ...ownerPolicies('rabbit_notes', t.user_id),
]);

export const decks = pgTable('decks', {
  // 既存の SavedDeck.id は Date.now().toString(36) (例 "m9x2k1p") で UUID ではない。
  // id 単独を主キーにすると別ユーザー間で同一ミリ秒の衝突が起きるため、
  // 既存 ID をそのまま text で持ち (user_id, id) の複合主キーとする。
  user_id: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  id: text('id').notNull(),
  name: text('name').notNull(),
  song_id: integer('song_id'),
  created_at: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  rev: bigint('rev', { mode: 'number' }).notNull().default(0),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.id] }),
  check('decks_id_len', sql`char_length(${t.id}) between 1 and 64`),
  check('decks_name_len', sql`char_length(${t.name}) between 1 and 200`),
  ...ownerPolicies('decks', t.user_id),
]);

export const deck_slots = pgTable('deck_slots', {
  // user_id を自前で持たせることで、RLS が exists(...) のサブクエリではなく
  // auth.uid() との単純比較で済む。
  user_id: uuid('user_id').notNull(),
  deck_id: text('deck_id').notNull(),
  slot_index: smallint('slot_index').notNull(),
  card_id: integer('card_id'),
  trained: boolean('trained').notNull().default(false),
  skill_level: smallint('skill_level'),
  bonus_tier: text('bonus_tier'),
  shared_broach_ids: integer('shared_broach_ids').array().notNull().default([]),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.deck_id, t.slot_index] }),
  foreignKey({
    columns: [t.user_id, t.deck_id],
    foreignColumns: [decks.user_id, decks.id],
    name: 'deck_slots_deck_fk',
  }).onDelete('cascade'),
  check('deck_slots_slot_range', sql`${t.slot_index} between 0 and 5`),
  ...ownerPolicies('deck_slots', t.user_id),
]);
```

- [ ] **Step 3: スキーマの契約を守るテストを書く**

列名の取り違えは PostgREST のレスポンスと `InferSelectModel` の型が食い違う形で表に出るため、テストで固定する。

`tests/unit/sync/schema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getTableConfig } from 'drizzle-orm/pg-core';
import {
  card_counts, deck_slots, decks, rabbit_notes, shared_broach_counts,
} from '../../../db/schema';

const TABLES = [card_counts, shared_broach_counts, rabbit_notes, decks, deck_slots];

describe('db/schema', () => {
  it('テーブル名が snake_case で固定されている', () => {
    expect(TABLES.map((t) => getTableConfig(t).name)).toEqual([
      'card_counts', 'shared_broach_counts', 'rabbit_notes', 'decks', 'deck_slots',
    ]);
  });

  it('TS のプロパティ名と列名が一致している (PostgREST のレスポンスと型を揃えるため)', () => {
    for (const table of TABLES) {
      for (const column of getTableConfig(table).columns) {
        expect(column.name).toBe(column.name.toLowerCase());
        expect(column.name).not.toMatch(/[A-Z]/);
      }
    }
  });

  // getTableConfig().policies が使えない drizzle-orm バージョンだった場合、
  // このアサーションは削除してよい。ポリシー数の本来の担保は Step 6 の
  // 生成 SQL 検査 (CREATE POLICY が 20 件) 側にある。
  it('全テーブルに RLS ポリシーが 4 本ある', () => {
    for (const table of TABLES) {
      const { policies } = getTableConfig(table);
      expect(policies.map((p) => p.name).sort()).toHaveLength(4);
    }
  });

  it('同期対象の 4 テーブルが rev 列を持つ (deck_slots は親デッキの rev を使うので持たない)', () => {
    for (const table of [card_counts, shared_broach_counts, rabbit_notes, decks]) {
      expect(getTableConfig(table).columns.map((c) => c.name)).toContain('rev');
    }
    expect(getTableConfig(deck_slots).columns.map((c) => c.name)).not.toContain('rev');
  });
});
```

- [ ] **Step 4: テストを走らせて通ることを確認する**

Run: `npx vitest run tests/unit/sync/schema.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: migration を生成する**

Run: `npx drizzle-kit generate --name=sync_tables`
Expected: `drizzle/` 配下に migration が生成される（DB 接続は発生しない）

- [ ] **Step 6: 生成された SQL を検証する**

```bash
SQL=$(find drizzle -name '*.sql' | sort | tail -1)
echo "検証対象: $SQL"
grep -c 'ENABLE ROW LEVEL SECURITY' "$SQL"   # 5 であること
grep -c 'CREATE POLICY' "$SQL"               # 20 であること
grep -i 'auth\.' "$SQL"                      # auth.uid() の参照のみで、auth スキーマへの DDL がないこと
grep -iE 'DROP|ALTER SCHEMA' "$SQL" || echo '破壊的な文なし'
```

Expected: `ENABLE ROW LEVEL SECURITY` が 5、`CREATE POLICY` が 20、`auth` への DDL なし、破壊的な文なし。
**満たさない場合は先に進まず `db/schema.ts` を直す。**

- [ ] **Step 7: 手書き SQL の migration を追加する**

Run: `npx drizzle-kit generate --custom --name=sync_rev_and_rpc`

生成された空の `migration.sql` に以下を書く:

```sql
-- ユーザーごとの単調増加カウンタ。増分プルのカーソルに使う。
-- updated_at による増分プルは端末時計とサーバ時計の混在で取りこぼすため採用しない。
create table public.sync_cursor (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rev bigint not null default 0
);

-- クライアントから直接読み書きさせない。ポリシーなし + RLS 有効 = 一切アクセス不可。
-- next_rev は security definer なので RLS を迂回して更新できる。
alter table public.sync_cursor enable row level security;
--> statement-breakpoint

create function public.next_rev(uid uuid) returns bigint
language plpgsql security definer as $$
declare r bigint;
begin
  insert into public.sync_cursor (user_id, rev) values (uid, 1)
  on conflict (user_id) do update set rev = public.sync_cursor.rev + 1
  returning rev into r;
  return r;
end $$;
--> statement-breakpoint

-- rev と updated_at はサーバ側で強制する。クライアントは送っても上書きされる。
-- auth.uid() ではなく new.user_id を使う (RLS が既に一致を保証しており、
-- deck_slots -> decks の伝播経路でも認証コンテキストに依存しない)。
create function public.set_rev() returns trigger language plpgsql as $$
begin
  new.rev := public.next_rev(new.user_id);
  new.updated_at := now();
  return new;
end $$;
--> statement-breakpoint

create trigger card_counts_set_rev before insert or update on public.card_counts
  for each row execute function public.set_rev();
--> statement-breakpoint
create trigger shared_broach_counts_set_rev before insert or update on public.shared_broach_counts
  for each row execute function public.set_rev();
--> statement-breakpoint
create trigger rabbit_notes_set_rev before insert or update on public.rabbit_notes
  for each row execute function public.set_rev();
--> statement-breakpoint
create trigger decks_set_rev before insert or update on public.decks
  for each row execute function public.set_rev();
--> statement-breakpoint

-- スロットの変更は親デッキの rev を繰り上げる (デッキ + スロットを 1 集約として扱う)
create function public.bump_deck_rev() returns trigger language plpgsql as $$
declare target_user uuid; target_deck text;
begin
  -- AFTER DELETE では NEW が未割当なので参照してはならない
  -- （coalesce(new.x, old.x) は "record new is not assigned yet" エラーになる）
  if TG_OP = 'DELETE' then
    target_user := old.user_id;
    target_deck := old.deck_id;
  else
    target_user := new.user_id;
    target_deck := new.deck_id;
  end if;

  update public.decks set updated_at = now()
   where user_id = target_user and id = target_deck;

  -- AFTER トリガーの戻り値は無視される
  return null;
end $$;
--> statement-breakpoint

create trigger deck_slots_bump_deck after insert or update or delete on public.deck_slots
  for each row execute function public.bump_deck_rev();
--> statement-breakpoint

-- デッキ 1 件の書き込みは decks 1 行 + deck_slots 6 行。HTTP を分けると原子性がないため
-- 1 回の呼び出しを 1 トランザクションにする。security invoker なので RLS はそのまま効く。
create function public.upsert_deck(payload jsonb)
returns bigint
language plpgsql security invoker as $$
declare
  uid uuid := auth.uid();
  -- 列名と同じ名前の変数にすると `where deck_id = deck_id` が恒真になり
  -- 他のデッキのスロットまで消えるため、必ず接頭辞を付ける
  v_deck_id text := payload->>'id';
  result_rev bigint;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.decks (user_id, id, name, song_id, created_at, deleted_at, rev)
  values (
    uid,
    v_deck_id,
    payload->>'name',
    nullif(payload->>'song_id', '')::integer,
    (payload->>'created_at')::timestamptz,
    nullif(payload->>'deleted_at', '')::timestamptz,
    0
  )
  on conflict (user_id, id) do update
    set name = excluded.name,
        song_id = excluded.song_id,
        deleted_at = excluded.deleted_at;

  delete from public.deck_slots where user_id = uid and deck_id = v_deck_id;

  insert into public.deck_slots (
    user_id, deck_id, slot_index, card_id, trained, skill_level, bonus_tier, shared_broach_ids
  )
  select
    uid,
    v_deck_id,
    (slot->>'slot_index')::smallint,
    nullif(slot->>'card_id', '')::integer,
    coalesce((slot->>'trained')::boolean, false),
    nullif(slot->>'skill_level', '')::smallint,
    nullif(slot->>'bonus_tier', ''),
    coalesce(
      (select array_agg(value::integer) from jsonb_array_elements_text(slot->'shared_broach_ids')),
      '{}'::integer[]
    )
  from jsonb_array_elements(payload->'slots') as slot;

  select rev into result_rev from public.decks where user_id = uid and id = v_deck_id;
  return result_rev;
end $$;
--> statement-breakpoint

-- 同期データの全削除 (フッターの「サーバのデータを削除」)。
-- auth.users の行は service_role が必要なため消せない (ADR 0064 決定 12)。
create function public.delete_all_sync_data()
returns void
language plpgsql security invoker as $$
declare uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  delete from public.deck_slots where user_id = uid;
  delete from public.decks where user_id = uid;
  delete from public.card_counts where user_id = uid;
  delete from public.shared_broach_counts where user_id = uid;
  delete from public.rabbit_notes where user_id = uid;
end $$;
```

- [ ] **Step 8: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit/sync/`
Expected: すべてエラーなし

- [ ] **Step 9: commit**

```bash
git add drizzle.config.ts db/schema.ts drizzle tests/unit/sync/schema.test.ts
git commit -m "feat(sync): Drizzle スキーマと migration を追加する (ADR 0064)"
```

> **注意:** migration の適用（`npx drizzle-kit migrate`）はここでは行わない。`DATABASE_URL` は issue #446 で用意され、適用は手動運用（ADR 0064 決定 9）。

---

### Task 3: 行の型と、汎用の行集合プロジェクション

所持衣装数と共通ブローチ所持数はどちらも `Record<string, number>` で同一の形なので、1 つの汎用実装で両方を担う。

**Files:**
- Create: `src/lib/sync/rows.ts`
- Create: `src/lib/sync/projection/countMap.ts`
- Test: `tests/unit/sync/projection/countMap.test.ts`

**Interfaces:**
- Consumes: `db/schema.ts`（Task 2）
- Produces:
  - `type RowSet<V> = Map<string, V>`
  - `type CardCountRow` / `SharedBroachCountRow` / `RabbitNoteRow` / `DeckRow` / `DeckSlotRow`
  - `countMapToRowSet(map: Record<string, number>): RowSet<number>`
  - `rowSetToCountMap(rows: RowSet<number>): Record<string, number>`
  - `countRowsToRowSet(rows: { card_id: number; count: number }[] | { broach_id: number; count: number }[], idKey: 'card_id' | 'broach_id'): RowSet<number>`

- [ ] **Step 1: `rows.ts` を書く**

```ts
import type { InferSelectModel } from 'drizzle-orm';
import type {
  card_counts, deck_slots, decks, rabbit_notes, shared_broach_counts,
} from '../../../db/schema';

/**
 * 同期の内部表現。行キー（文字列）から値への写像。
 * localStorage 側の JSON もサーバ側の行もこの形に落として比較する。
 */
export type RowSet<V> = Map<string, V>;

export type CardCountRow = InferSelectModel<typeof card_counts>;
export type SharedBroachCountRow = InferSelectModel<typeof shared_broach_counts>;
export type RabbitNoteRow = InferSelectModel<typeof rabbit_notes>;
export type DeckRow = InferSelectModel<typeof decks>;
export type DeckSlotRow = InferSelectModel<typeof deck_slots>;
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/unit/sync/projection/countMap.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  countMapToRowSet, countRowsToRowSet, rowSetToCountMap,
} from '../../../../src/lib/sync/projection/countMap';

describe('countMapToRowSet', () => {
  it('localStorage の CountMap を行集合にする', () => {
    expect([...countMapToRowSet({ '5': 2, '12': 1 })]).toEqual([['5', 2], ['12', 1]]);
  });

  it('0 のエントリも行として残す (0 が削除の表現であり tombstone を兼ねる)', () => {
    expect([...countMapToRowSet({ '5': 0 })]).toEqual([['5', 0]]);
  });

  it('負値・小数・NaN は 0 以上の整数に丸める', () => {
    expect([...countMapToRowSet({ a: -3, b: 2.7, c: Number.NaN })]).toEqual([['a', 0], ['b', 2], ['c', 0]]);
  });

  it('空オブジェクトは空の行集合', () => {
    expect(countMapToRowSet({}).size).toBe(0);
  });
});

describe('rowSetToCountMap', () => {
  it('行集合を CountMap に戻す。0 のエントリは落とす (既存ストアの表現に合わせる)', () => {
    expect(rowSetToCountMap(new Map([['5', 2], ['12', 0]]))).toEqual({ '5': 2 });
  });

  it('空の行集合は空オブジェクト', () => {
    expect(rowSetToCountMap(new Map())).toEqual({});
  });
});

describe('countRowsToRowSet', () => {
  it('card_id の行を行集合にする', () => {
    const rows = [{ card_id: 5, count: 2 }, { card_id: 12, count: 0 }];
    expect([...countRowsToRowSet(rows, 'card_id')]).toEqual([['5', 2], ['12', 0]]);
  });

  it('broach_id の行を行集合にする', () => {
    expect([...countRowsToRowSet([{ broach_id: 3, count: 1 }], 'broach_id')]).toEqual([['3', 1]]);
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/projection/countMap.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 4: `countMap.ts` を実装する**

```ts
import type { RowSet } from '../rows';

export type CountMap = Record<string, number>;

/** 0 以上の整数に正規化する。NaN / undefined は 0 */
function normalize(value: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * localStorage の CountMap を行集合にする。
 *
 * 0 のエントリを残すのが要点。所持数 0 と未所持はドメイン上同じ意味なので、
 * サーバ側では行を消さず 0 を書くことで削除の伝播を通常の値変更に還元している
 * (ADR 0064 決定 4)。
 */
export function countMapToRowSet(map: CountMap): RowSet<number> {
  return new Map(Object.entries(map).map(([key, value]) => [key, normalize(value)]));
}

/**
 * 行集合を CountMap に戻す。0 は落とす。
 * 既存の cardCounts / broachCounts ストアが 0 のときキーを delete する表現に揃える。
 */
export function rowSetToCountMap(rows: RowSet<number>): CountMap {
  const out: CountMap = {};
  for (const [key, value] of rows) {
    if (value > 0) out[key] = value;
  }
  return out;
}

/** サーバから引いた行を行集合にする */
export function countRowsToRowSet(
  rows: readonly Record<string, unknown>[],
  idKey: 'card_id' | 'broach_id',
): RowSet<number> {
  return new Map(
    rows.map((row) => [String(row[idKey]), normalize(row.count as number)]),
  );
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/projection/countMap.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 6: commit**

```bash
git add src/lib/sync/rows.ts src/lib/sync/projection/countMap.ts tests/unit/sync/projection/countMap.test.ts
git commit -m "feat(sync): 所持数系のプロジェクションを追加する (ADR 0064)"
```

---

### Task 4: ラビットノートのプロジェクション

**Files:**
- Create: `src/lib/sync/projection/rabbitNotes.ts`
- Test: `tests/unit/sync/projection/rabbitNotes.test.ts`

**Interfaces:**
- Consumes: `RowSet` (Task 3)
- Produces:
  - `type RabbitNoteValue = { shout: number; beat: number; melody: number }`
  - `rabbitMapToRowSet(map: RabbitNoteMap): RowSet<RabbitNoteValue>`
  - `rowSetToRabbitMap(rows: RowSet<RabbitNoteValue>): RabbitNoteMap`
  - `rabbitRowsToRowSet(rows: RabbitNoteRow[]): RowSet<RabbitNoteValue>`
  - `rabbitEquals(a: RabbitNoteValue, b: RabbitNoteValue): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/sync/projection/rabbitNotes.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  rabbitEquals, rabbitMapToRowSet, rabbitRowsToRowSet, rowSetToRabbitMap,
} from '../../../../src/lib/sync/projection/rabbitNotes';

describe('rabbitMapToRowSet', () => {
  it('キャラクター名をキーに行集合を作る', () => {
    const map = { 七瀬陸: { shout: 1, beat: 2, melody: 3 } };
    expect([...rabbitMapToRowSet(map)]).toEqual([['七瀬陸', { shout: 1, beat: 2, melody: 3 }]]);
  });

  it('欠けた属性・負値・小数は 0 以上の整数に丸める', () => {
    const map = { 和泉一織: { shout: -1, beat: 2.9, melody: Number.NaN } };
    expect(rabbitMapToRowSet(map).get('和泉一織')).toEqual({ shout: 0, beat: 2, melody: 0 });
  });

  it('空オブジェクトは空の行集合', () => {
    expect(rabbitMapToRowSet({}).size).toBe(0);
  });
});

describe('rowSetToRabbitMap', () => {
  it('行集合を RabbitNoteMap に戻す', () => {
    const rows = new Map([['二階堂大和', { shout: 0, beat: 0, melody: 5 }]]);
    expect(rowSetToRabbitMap(rows)).toEqual({ 二階堂大和: { shout: 0, beat: 0, melody: 5 } });
  });

  it('全属性 0 のエントリも残す (0 が未所持の表現)', () => {
    const rows = new Map([['四葉環', { shout: 0, beat: 0, melody: 0 }]]);
    expect(rowSetToRabbitMap(rows)).toEqual({ 四葉環: { shout: 0, beat: 0, melody: 0 } });
  });
});

describe('rabbitRowsToRowSet', () => {
  it('サーバの行から行集合を作る (余分な列は無視する)', () => {
    const rows = [{
      user_id: 'u', character: '逢坂壮五', shout: 1, beat: 0, melody: 0,
      rev: 7, updated_at: '2026-08-31T00:00:00Z',
    }];
    expect([...rabbitRowsToRowSet(rows)]).toEqual([['逢坂壮五', { shout: 1, beat: 0, melody: 0 }]]);
  });
});

describe('rabbitEquals', () => {
  it('3 属性すべて一致で true', () => {
    expect(rabbitEquals({ shout: 1, beat: 2, melody: 3 }, { shout: 1, beat: 2, melody: 3 })).toBe(true);
  });

  it('1 属性でも違えば false', () => {
    expect(rabbitEquals({ shout: 1, beat: 2, melody: 3 }, { shout: 1, beat: 2, melody: 4 })).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/projection/rabbitNotes.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: `rabbitNotes.ts` を実装する**

```ts
import type { RabbitNoteMap } from '../../data/rabbitNote';
import type { RabbitNoteRow, RowSet } from '../rows';

export type RabbitNoteValue = { shout: number; beat: number; melody: number };

function normalize(value: number | undefined): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toValue(entry: Partial<RabbitNoteValue>): RabbitNoteValue {
  return { shout: normalize(entry.shout), beat: normalize(entry.beat), melody: normalize(entry.melody) };
}

export function rabbitMapToRowSet(map: RabbitNoteMap): RowSet<RabbitNoteValue> {
  return new Map(Object.entries(map).map(([character, entry]) => [character, toValue(entry)]));
}

/** 全属性 0 のエントリも残す。0 が未所持の表現であり、削除の伝播を値変更に還元している */
export function rowSetToRabbitMap(rows: RowSet<RabbitNoteValue>): RabbitNoteMap {
  const out: RabbitNoteMap = {};
  for (const [character, value] of rows) out[character] = { ...value };
  return out;
}

export function rabbitRowsToRowSet(rows: readonly RabbitNoteRow[]): RowSet<RabbitNoteValue> {
  return new Map(rows.map((row) => [row.character, toValue(row)]));
}

export function rabbitEquals(a: RabbitNoteValue, b: RabbitNoteValue): boolean {
  return a.shout === b.shout && a.beat === b.beat && a.melody === b.melody;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/projection/rabbitNotes.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: commit**

```bash
git add src/lib/sync/projection/rabbitNotes.ts tests/unit/sync/projection/rabbitNotes.test.ts
git commit -m "feat(sync): ラビットノートのプロジェクションを追加する (ADR 0064)"
```

---

### Task 5: デッキのプロジェクション

`SavedDeck`（`src/components/ScoreCalc.svelte:219` / `src/components/DeckList.svelte:25`）とサーバの `decks` + `deck_slots` を相互変換する。同期対象の中で最も構造が深い。

**Files:**
- Create: `src/lib/sync/projection/decks.ts`
- Test: `tests/unit/sync/projection/decks.test.ts`

**Interfaces:**
- Consumes: `RowSet` (Task 3)
- Produces:
  - `type SyncedDeck` / `type SyncedDeckSlot`
  - `savedDecksToRowSet(decks: SavedDeck[]): RowSet<SyncedDeck>`
  - `rowSetToSavedDecks(rows: RowSet<SyncedDeck>): SavedDeck[]`
  - `deckRowsToRowSet(decks: DeckRow[], slots: DeckSlotRow[]): RowSet<SyncedDeck>`
  - `deckEquals(a: SyncedDeck, b: SyncedDeck): boolean`
  - `SLOT_COUNT = 6`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/sync/projection/decks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  deckEquals, deckRowsToRowSet, rowSetToSavedDecks, savedDecksToRowSet, SLOT_COUNT,
} from '../../../../src/lib/sync/projection/decks';
import type { SavedDeck } from '../../../../src/lib/sync/projection/decks';

const deck: SavedDeck = {
  id: 'm9x2k1p',
  name: 'イベント用フル特効',
  createdAt: 1_780_000_000_000,
  updatedAt: 1_780_000_100_000,
  state: {
    songId: 42,
    deckIds: [101, 102, null, 104, 105, 106],
    bonusTiers: ['gold', 'silver', '', 'none', 'none', 'none'],
    trained: [true, false, false, true, false, false],
    sharedBroachs: [[1, 2], [], [], [3], [], []],
    skillLevels: [5, 4, 0, 3, 2, 1],
  },
};

describe('savedDecksToRowSet', () => {
  it('デッキ ID をキーにし、スロットを常に 6 件に正規化する', () => {
    const value = savedDecksToRowSet([deck]).get('m9x2k1p');
    expect(value?.name).toBe('イベント用フル特効');
    expect(value?.song_id).toBe(42);
    expect(value?.deleted_at).toBeNull();
    expect(value?.slots).toHaveLength(SLOT_COUNT);
    expect(value?.slots[0]).toEqual({
      slot_index: 0, card_id: 101, trained: true, skill_level: 5,
      bonus_tier: 'gold', shared_broach_ids: [1, 2],
    });
  });

  it('epoch ミリ秒を ISO 文字列にする', () => {
    expect(savedDecksToRowSet([deck]).get('m9x2k1p')?.created_at)
      .toBe(new Date(1_780_000_000_000).toISOString());
  });

  it('配列が 6 件に足りないデッキでも 6 スロットに埋める', () => {
    const short: SavedDeck = {
      ...deck,
      id: 'short',
      state: { songId: null, deckIds: [7], bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [] },
    };
    const value = savedDecksToRowSet([short]).get('short');
    expect(value?.slots).toHaveLength(SLOT_COUNT);
    expect(value?.slots[5]).toEqual({
      slot_index: 5, card_id: null, trained: false, skill_level: null,
      bonus_tier: null, shared_broach_ids: [],
    });
  });

  it('空文字の bonusTier は null にする', () => {
    expect(savedDecksToRowSet([deck]).get('m9x2k1p')?.slots[2].bonus_tier).toBeNull();
  });
});

describe('rowSetToSavedDecks', () => {
  it('往復して元の SavedDeck に戻る', () => {
    const restored = rowSetToSavedDecks(savedDecksToRowSet([deck]));
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe(deck.id);
    expect(restored[0].name).toBe(deck.name);
    expect(restored[0].createdAt).toBe(deck.createdAt);
    expect(restored[0].state.deckIds).toEqual(deck.state.deckIds);
    expect(restored[0].state.sharedBroachs).toEqual(deck.state.sharedBroachs);
    expect(restored[0].state.skillLevels).toEqual(deck.state.skillLevels);
  });

  it('deleted_at が入っているデッキは復元しない (tombstone)', () => {
    const rows = savedDecksToRowSet([deck]);
    rows.set('m9x2k1p', { ...rows.get('m9x2k1p')!, deleted_at: '2026-08-31T00:00:00.000Z' });
    expect(rowSetToSavedDecks(rows)).toEqual([]);
  });

  it('updatedAt の降順ではなく createdAt の昇順で返す (既存の保存順を保つ)', () => {
    const older: SavedDeck = { ...deck, id: 'older', createdAt: 1_000, updatedAt: 9_999 };
    const rows = savedDecksToRowSet([deck, older]);
    expect(rowSetToSavedDecks(rows).map((d) => d.id)).toEqual(['older', 'm9x2k1p']);
  });
});

describe('deckRowsToRowSet', () => {
  it('デッキ行とスロット行を結合する', () => {
    const deckRows = [{
      user_id: 'u', id: 'd1', name: 'A', song_id: 3,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null, rev: 5,
    }];
    const slotRows = [{
      user_id: 'u', deck_id: 'd1', slot_index: 0, card_id: 9, trained: true,
      skill_level: 2, bonus_tier: 'gold', shared_broach_ids: [4],
    }];
    const value = deckRowsToRowSet(deckRows, slotRows).get('d1');
    expect(value?.slots).toHaveLength(SLOT_COUNT);
    expect(value?.slots[0].card_id).toBe(9);
    expect(value?.slots[1].card_id).toBeNull();
  });

  it('スロット行が無いデッキでも 6 スロットの空枠になる', () => {
    const deckRows = [{
      user_id: 'u', id: 'd2', name: 'B', song_id: null,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null, rev: 1,
    }];
    expect(deckRowsToRowSet(deckRows, []).get('d2')?.slots).toHaveLength(SLOT_COUNT);
  });
});

describe('deckEquals', () => {
  it('同一内容なら true', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    expect(deckEquals(a, b)).toBe(true);
  });

  it('スロットが 1 つでも違えば false', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    b.slots[3] = { ...b.slots[3], card_id: 999 };
    expect(deckEquals(a, b)).toBe(false);
  });

  it('updated_at の違いは無視する (サーバが採番する値であり内容ではない)', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = { ...a, updated_at: '2030-01-01T00:00:00.000Z' };
    expect(deckEquals(a, b)).toBe(true);
  });

  it('created_at は書式が違っても同時刻なら等しいとみなす (Postgres の描画差を吸収)', () => {
    // クライアントは 2026-08-31T00:00:00.000Z を送るが Postgres は
    // 2026-08-31T00:00:00+00:00 の形で返す。文字列比較だと永久に再 push される
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = { ...a, created_at: new Date(Date.parse(a.created_at)).toISOString().replace('Z', '+00:00') };
    expect(deckEquals(a, b)).toBe(true);
  });

  it('tombstone は時刻が違っても等しいとみなす (削除されているかだけを比べる)', () => {
    const a = { ...savedDecksToRowSet([deck]).get('m9x2k1p')!, deleted_at: '2026-08-31T00:00:00.000Z' };
    const b = { ...a, deleted_at: '2026-09-01T00:00:00.000Z' };
    expect(deckEquals(a, b)).toBe(true);
  });

  it('片方だけが tombstone なら等しくない', () => {
    const a = savedDecksToRowSet([deck]).get('m9x2k1p')!;
    const b = { ...a, deleted_at: '2026-08-31T00:00:00.000Z' };
    expect(deckEquals(a, b)).toBe(false);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/projection/decks.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: `decks.ts` を実装する**

```ts
import type { DeckRow, DeckSlotRow, RowSet } from '../rows';

/** スロット数。0=センター / 1-4=メンバー / 5=フレンド */
export const SLOT_COUNT = 6;

/**
 * localStorage の保存デッキ。
 * `src/components/ScoreCalc.svelte` / `DeckList.svelte` の型と同じ形をここで固定する。
 * ID は Date.now().toString(36) で UUID ではない。
 */
export type SavedDeck = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: {
    songId: number | null;
    deckIds: (number | null)[];
    bonusTiers: string[];
    trained: boolean[];
    sharedBroachs: number[][];
    skillLevels: number[];
  };
};

export type SyncedDeckSlot = {
  slot_index: number;
  card_id: number | null;
  trained: boolean;
  skill_level: number | null;
  bonus_tier: string | null;
  shared_broach_ids: number[];
};

export type SyncedDeck = {
  name: string;
  song_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  slots: SyncedDeckSlot[];
};

function nullableInt(value: unknown): number | null {
  // null / undefined を先に弾くこと。Number(null) は 0 になるため、
  // 空スロット (deckIds の null) が衣装 ID 0 として同期されてしまう
  if (value === null || value === undefined) return null;
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : null;
}

function emptySlot(slotIndex: number): SyncedDeckSlot {
  return {
    slot_index: slotIndex, card_id: null, trained: false,
    skill_level: null, bonus_tier: null, shared_broach_ids: [],
  };
}

export function savedDecksToRowSet(decks: readonly SavedDeck[]): RowSet<SyncedDeck> {
  const out: RowSet<SyncedDeck> = new Map();
  for (const deck of decks) {
    const state = deck.state;
    const slots = Array.from({ length: SLOT_COUNT }, (_, slotIndex) => ({
      slot_index: slotIndex,
      card_id: nullableInt(state.deckIds?.[slotIndex]),
      trained: state.trained?.[slotIndex] === true,
      skill_level: nullableInt(state.skillLevels?.[slotIndex]),
      bonus_tier: state.bonusTiers?.[slotIndex] || null,
      shared_broach_ids: [...(state.sharedBroachs?.[slotIndex] ?? [])],
    }));
    out.set(deck.id, {
      name: deck.name,
      song_id: nullableInt(state.songId),
      created_at: new Date(deck.createdAt).toISOString(),
      updated_at: new Date(deck.updatedAt).toISOString(),
      deleted_at: null,
      slots,
    });
  }
  return out;
}

export function rowSetToSavedDecks(rows: RowSet<SyncedDeck>): SavedDeck[] {
  const out: SavedDeck[] = [];
  for (const [id, value] of rows) {
    if (value.deleted_at !== null) continue;   // tombstone は復元しない
    out.push({
      id,
      name: value.name,
      createdAt: Date.parse(value.created_at),
      updatedAt: Date.parse(value.updated_at),
      state: {
        songId: value.song_id,
        deckIds: value.slots.map((s) => s.card_id),
        bonusTiers: value.slots.map((s) => s.bonus_tier ?? ''),
        trained: value.slots.map((s) => s.trained),
        sharedBroachs: value.slots.map((s) => [...s.shared_broach_ids]),
        skillLevels: value.slots.map((s) => s.skill_level ?? 0),
      },
    });
  }
  // 既存の保存順（作成順に push される）を保つ
  return out.sort((a, b) => a.createdAt - b.createdAt);
}

export function deckRowsToRowSet(
  deckRows: readonly DeckRow[],
  slotRows: readonly DeckSlotRow[],
): RowSet<SyncedDeck> {
  const slotsByDeck = new Map<string, SyncedDeckSlot[]>();
  for (const row of slotRows) {
    const slots = slotsByDeck.get(row.deck_id)
      ?? Array.from({ length: SLOT_COUNT }, (_, i) => emptySlot(i));
    if (row.slot_index >= 0 && row.slot_index < SLOT_COUNT) {
      slots[row.slot_index] = {
        slot_index: row.slot_index,
        card_id: row.card_id,
        trained: row.trained,
        skill_level: row.skill_level,
        bonus_tier: row.bonus_tier,
        shared_broach_ids: [...row.shared_broach_ids],
      };
    }
    slotsByDeck.set(row.deck_id, slots);
  }

  const out: RowSet<SyncedDeck> = new Map();
  for (const row of deckRows) {
    out.set(row.id, {
      name: row.name,
      song_id: row.song_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
      deleted_at: row.deleted_at,
      slots: slotsByDeck.get(row.id) ?? Array.from({ length: SLOT_COUNT }, (_, i) => emptySlot(i)),
    });
  }
  return out;
}

function slotEquals(a: SyncedDeckSlot, b: SyncedDeckSlot): boolean {
  return a.slot_index === b.slot_index
    && a.card_id === b.card_id
    && a.trained === b.trained
    && a.skill_level === b.skill_level
    && a.bonus_tier === b.bonus_tier
    && a.shared_broach_ids.length === b.shared_broach_ids.length
    && a.shared_broach_ids.every((id, i) => id === b.shared_broach_ids[i]);
}

/**
 * updated_at はサーバが採番する値であり「内容」ではないので比較から除く。
 * ここに含めると、サーバから取り込んだ直後に必ず差分ありと判定されてしまう。
 *
 * created_at は**生文字列で比較してはならない**。クライアントは
 * `new Date(ms).toISOString()`（`2026-08-31T00:00:00.000Z`）を送るが、
 * Postgres は timestamptz を `2026-08-31T00:00:00+00:00` の形で返す。
 * 文字列比較にすると全デッキが毎回「変更あり」と判定され永久に再 push される。
 *
 * deleted_at も同様に厳密比較しない。tombstone の時刻は利用者のデータではなく、
 * push のたびに再スタンプされるため、「削除されているか」だけを比べる。
 */
export function deckEquals(a: SyncedDeck, b: SyncedDeck): boolean {
  return a.name === b.name
    && a.song_id === b.song_id
    && Date.parse(a.created_at) === Date.parse(b.created_at)
    && (a.deleted_at === null) === (b.deleted_at === null)
    && a.slots.length === b.slots.length
    && a.slots.every((slot, i) => slotEquals(slot, b.slots[i]));
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/projection/decks.test.ts`
Expected: PASS（15 tests）

- [ ] **Step 5: commit**

```bash
git add src/lib/sync/projection/decks.ts tests/unit/sync/projection/decks.test.ts
git commit -m "feat(sync): デッキのプロジェクションを追加する (ADR 0064)"
```

---

### Task 6: 2-way 差分

**Files:**
- Create: `src/lib/sync/diff.ts`
- Test: `tests/unit/sync/diff.test.ts`

**Interfaces:**
- Consumes: `RowSet` (Task 3)
- Consumed by: Task 11 の `hasPendingLocalChanges()`
- Produces:
  - `type Diff<V> = { added: [string, V][]; changed: [string, V][]; removed: string[] }`
  - `diffRowSets<V>(baseline: RowSet<V>, current: RowSet<V>, equals: (a: V, b: V) => boolean): Diff<V>`
  - `hasChanges<V>(diff: Diff<V>): boolean`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/sync/diff.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffRowSets, hasChanges } from '../../../src/lib/sync/diff';

const numEquals = (a: number, b: number) => a === b;

describe('diffRowSets', () => {
  it('ベースラインに無い行を added として返す', () => {
    const diff = diffRowSets(new Map(), new Map([['a', 1]]), numEquals);
    expect(diff).toEqual({ added: [['a', 1]], changed: [], removed: [] });
  });

  it('値が変わった行を changed として返す', () => {
    const diff = diffRowSets(new Map([['a', 1]]), new Map([['a', 2]]), numEquals);
    expect(diff).toEqual({ added: [], changed: [['a', 2]], removed: [] });
  });

  it('現在に無い行を removed として返す', () => {
    const diff = diffRowSets(new Map([['a', 1]]), new Map(), numEquals);
    expect(diff).toEqual({ added: [], changed: [], removed: ['a'] });
  });

  it('値が同じ行は何にも含めない', () => {
    const diff = diffRowSets(new Map([['a', 1]]), new Map([['a', 1]]), numEquals);
    expect(diff).toEqual({ added: [], changed: [], removed: [] });
  });

  it('追加・変更・削除・無変更が混在しても正しく分類する', () => {
    const baseline = new Map([['keep', 1], ['change', 1], ['drop', 1]]);
    const current = new Map([['keep', 1], ['change', 2], ['new', 3]]);
    const diff = diffRowSets(baseline, current, numEquals);
    expect(diff.added).toEqual([['new', 3]]);
    expect(diff.changed).toEqual([['change', 2]]);
    expect(diff.removed).toEqual(['drop']);
  });

  it('equals をオブジェクト比較に差し替えられる', () => {
    type V = { n: number };
    const eq = (a: V, b: V) => a.n === b.n;
    const diff = diffRowSets<V>(new Map([['a', { n: 1 }]]), new Map([['a', { n: 1 }]]), eq);
    expect(diff.changed).toEqual([]);
  });
});

describe('hasChanges', () => {
  it('3 つとも空なら false', () => {
    expect(hasChanges({ added: [], changed: [], removed: [] })).toBe(false);
  });

  it('いずれかに要素があれば true', () => {
    expect(hasChanges({ added: [['a', 1]], changed: [], removed: [] })).toBe(true);
    expect(hasChanges({ added: [], changed: [['a', 1]], removed: [] })).toBe(true);
    expect(hasChanges({ added: [], changed: [], removed: ['a'] })).toBe(true);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/diff.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: `diff.ts` を実装する**

```ts
import type { RowSet } from './rows';

export type Diff<V> = {
  added: [string, V][];
  changed: [string, V][];
  removed: string[];
};

/**
 * ベースラインと現在の行集合を比較する。
 *
 * ベースラインは「最後にサーバと一致していると確認できた行集合」なので、
 * この差分がそのまま「未同期のローカル変更」を表す。これにより dirty フラグが不要になり、
 * push が失敗しても次回に同じ差分が再検出される（同期がべき等になる）。
 */
export function diffRowSets<V>(
  baseline: RowSet<V>,
  current: RowSet<V>,
  equals: (a: V, b: V) => boolean,
): Diff<V> {
  const added: [string, V][] = [];
  const changed: [string, V][] = [];
  const removed: string[] = [];

  for (const [key, value] of current) {
    if (!baseline.has(key)) {
      added.push([key, value]);
    } else if (!equals(baseline.get(key) as V, value)) {
      changed.push([key, value]);
    }
  }
  for (const key of baseline.keys()) {
    if (!current.has(key)) removed.push(key);
  }

  return { added, changed, removed };
}

export function hasChanges<V>(diff: Diff<V>): boolean {
  return diff.added.length > 0 || diff.changed.length > 0 || diff.removed.length > 0;
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/diff.test.ts`
Expected: PASS（8 tests）

- [ ] **Step 5: commit**

```bash
git add src/lib/sync/diff.ts tests/unit/sync/diff.test.ts
git commit -m "feat(sync): ベースラインとの 2-way 差分を追加する (ADR 0064)"
```

---

### Task 7: 3-way マージ判定

**Files:**
- Create: `src/lib/sync/merge.ts`
- Test: `tests/unit/sync/merge.test.ts`

**Interfaces:**
- Consumes: `RowSet` (Task 3)
- Produces:
  - `type MergeVerdict<V>` = `{ kind: 'noop' | 'push' | 'adopt'; key: string; value: V | null }` または `{ kind: 'conflict'; key: string; local: V | null; server: V | null }`
  - `mergeRow<V>(args): MergeVerdict<V>`
  - `mergeRowSets<V>(baseline, local, server, equals): MergeVerdict<V>[]`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/sync/merge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mergeRow, mergeRowSets } from '../../../src/lib/sync/merge';

const eq = (a: number, b: number) => a === b;
const row = (baseline: number | null, local: number | null, server: number | null) =>
  mergeRow({ key: 'k', baseline, local, server, equals: eq });

describe('mergeRow', () => {
  it('ローカルもサーバもベースラインと同じなら noop', () => {
    expect(row(1, 1, 1)).toEqual({ kind: 'noop', key: 'k', value: 1 });
  });

  it('ローカルだけ変わっていれば push', () => {
    expect(row(1, 2, 1)).toEqual({ kind: 'push', key: 'k', value: 2 });
  });

  it('サーバだけ変わっていれば adopt', () => {
    expect(row(1, 1, 2)).toEqual({ kind: 'adopt', key: 'k', value: 2 });
  });

  it('両方が別々に変わっていれば conflict', () => {
    expect(row(1, 2, 3)).toEqual({ kind: 'conflict', key: 'k', local: 2, server: 3 });
  });

  it('両方が同じ値に変わっていれば収束済みとして noop', () => {
    expect(row(1, 2, 2)).toEqual({ kind: 'noop', key: 'k', value: 2 });
  });

  it('ベースラインが無くローカルのみ値があれば push (初回の新規行)', () => {
    expect(row(null, 5, null)).toEqual({ kind: 'push', key: 'k', value: 5 });
  });

  it('ベースラインが無くサーバのみ値があれば adopt', () => {
    expect(row(null, null, 5)).toEqual({ kind: 'adopt', key: 'k', value: 5 });
  });

  it('ベースラインが無く両方に別の値があれば conflict (初回リンク)', () => {
    expect(row(null, 5, 6)).toEqual({ kind: 'conflict', key: 'k', local: 5, server: 6 });
  });

  it('ローカルで削除されサーバは変化なしなら push(null)', () => {
    expect(row(1, null, 1)).toEqual({ kind: 'push', key: 'k', value: null });
  });

  it('サーバで削除されローカルは変化なしなら adopt(null)', () => {
    expect(row(1, 1, null)).toEqual({ kind: 'adopt', key: 'k', value: null });
  });

  it('両方で削除されていれば noop', () => {
    expect(row(1, null, null)).toEqual({ kind: 'noop', key: 'k', value: null });
  });
});

describe('mergeRowSets', () => {
  it('3 つの行集合に現れる全キーを対象にする', () => {
    const verdicts = mergeRowSets(
      new Map([['b', 1]]),
      new Map([['l', 1]]),
      new Map([['s', 1]]),
      eq,
    );
    expect(verdicts.map((v) => v.key).sort()).toEqual(['b', 'l', 's']);
  });

  it('キーごとに独立に判定する (競合が他のキーの同期を止めない)', () => {
    const verdicts = mergeRowSets(
      new Map([['a', 1], ['b', 1]]),
      new Map([['a', 2], ['b', 9]]),
      new Map([['a', 1], ['b', 8]]),
      eq,
    );
    expect(verdicts.find((v) => v.key === 'a')).toEqual({ kind: 'push', key: 'a', value: 2 });
    expect(verdicts.find((v) => v.key === 'b')).toEqual({ kind: 'conflict', key: 'b', local: 9, server: 8 });
  });

  it('noop だけの場合も全キーぶん返す', () => {
    const same = new Map([['a', 1]]);
    expect(mergeRowSets(same, same, same, eq)).toEqual([{ kind: 'noop', key: 'a', value: 1 }]);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/merge.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: `merge.ts` を実装する**

```ts
import type { RowSet } from './rows';

export type MergeVerdict<V> =
  | { kind: 'noop'; key: string; value: V | null }
  | { kind: 'push'; key: string; value: V | null }
  | { kind: 'adopt'; key: string; value: V | null }
  | { kind: 'conflict'; key: string; local: V | null; server: V | null };

/** null（行なし）も含めた同値判定 */
function same<V>(a: V | null, b: V | null, equals: (x: V, y: V) => boolean): boolean {
  if (a === null || b === null) return a === b;
  return equals(a, b);
}

/**
 * ベースライン B / ローカル現在 L / サーバ現在 S の 3 値から行単位の処分を決める。
 *
 * 2 値では「自分が変えた」と「相手が変えた」を区別できないため、
 * ベースラインを基準点に置くのがこの設計の中核（ADR 0064 決定 6）。
 */
export function mergeRow<V>(args: {
  key: string;
  baseline: V | null;
  local: V | null;
  server: V | null;
  equals: (a: V, b: V) => boolean;
}): MergeVerdict<V> {
  const { key, baseline, local, server, equals } = args;
  const localChanged = !same(baseline, local, equals);
  const serverChanged = !same(baseline, server, equals);

  if (!localChanged && !serverChanged) return { kind: 'noop', key, value: local };
  if (localChanged && !serverChanged) return { kind: 'push', key, value: local };
  if (!localChanged && serverChanged) return { kind: 'adopt', key, value: server };
  // 両方変わった。同じ値へ収束していれば競合ではない
  if (same(local, server, equals)) return { kind: 'noop', key, value: local };
  return { kind: 'conflict', key, local, server };
}

export function mergeRowSets<V>(
  baseline: RowSet<V>,
  local: RowSet<V>,
  server: RowSet<V>,
  equals: (a: V, b: V) => boolean,
): MergeVerdict<V>[] {
  const keys = new Set<string>([...baseline.keys(), ...local.keys(), ...server.keys()]);
  return [...keys].map((key) => mergeRow({
    key,
    baseline: baseline.has(key) ? (baseline.get(key) as V) : null,
    local: local.has(key) ? (local.get(key) as V) : null,
    server: server.has(key) ? (server.get(key) as V) : null,
    equals,
  }));
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/merge.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 5: commit**

```bash
git add src/lib/sync/merge.ts tests/unit/sync/merge.test.ts
git commit -m "feat(sync): 3-way マージ判定を追加する (ADR 0064)"
```

---

### Task 8: `storage.ts` の変更通知フックとバックアップ除外

**Files:**
- Modify: `src/lib/storage.ts`
- Modify: `src/components/FooterTools.svelte`
- Test: `tests/unit/storage.test.ts`（既存に追記）

**Interfaces:**
- Consumes: なし
- Produces:
  - `STORAGE_KEYS.SYNC_META = 'i7_sync_meta'` / `STORAGE_KEYS.SYNC_BASELINE = 'i7_sync_baseline'`
  - `BACKUP_EXCLUDED_KEYS: ReadonlySet<string>`
  - `onSave(listener: (key: string) => void): () => void`
  - `FooterTools` がインポート復元後に `window` へ `i7:backup-imported` イベントを発火する

- [ ] **Step 1: 失敗するテストを `tests/unit/storage.test.ts` の末尾に追記する**

```ts
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
    expect([...BACKUP_EXCLUDED_KEYS].sort()).toEqual(['i7_sync_baseline', 'i7_sync_meta']);
  });

  it('除外キーはすべて STORAGE_KEYS に存在する', () => {
    const all = new Set<string>(Object.values(STORAGE_KEYS));
    for (const key of BACKUP_EXCLUDED_KEYS) expect(all.has(key)).toBe(true);
  });
});
```

先頭の import 行を次に差し替える:

```ts
import { STORAGE_KEYS, BACKUP_EXCLUDED_KEYS, loadJson, saveJson, onSave } from '../../src/lib/storage';
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: FAIL（`onSave` / `BACKUP_EXCLUDED_KEYS` が export されていない）

- [ ] **Step 3: `storage.ts` を変更する**

`STORAGE_KEYS` に 2 キーを追加する:

```ts
export const STORAGE_KEYS = {
  CARD_COUNTS: 'i7_card_counts',
  RABBIT_NOTES: 'i7_rabbit_notes',
  SELECTED_SONGS: 'i7_selected_songs',
  SAVED_DECKS: 'i7_saved_decks',
  SCORE_CALC_STATE: 'i7_score_calc_state',
  SHARED_BROACH_COUNTS: 'i7_shared_broach_counts',
  CARD_LIST_VIEW_MODE: 'i7_card_list_view_mode',
  COMPARE_EVENT_ID: 'i7_compare_event_id',
  MAX_FINDER_EVENT_ID: 'i7_max_finder_event_id',
  POINT_CALC_STATE: 'i7_point_calc_state',
  SYNC_META: 'i7_sync_meta',
  SYNC_BASELINE: 'i7_sync_baseline',
} as const;

/**
 * バックアップ（FooterTools の JSON エクスポート）の対象から外すキー。
 *
 * 同期メタとベースラインは「この端末がどこまでサーバと一致しているか」を表す端末固有の
 * 状態であり、別端末のものを取り込むと同期エンジンが「同期済み」と誤認して未同期の
 * 変更を取りこぼす。CLAUDE.md の「新しいキーは必ず STORAGE_KEYS に追記する
 * （バックアップ対象に含めるため）」に対する唯一の例外（ADR 0064 決定 10）。
 */
export const BACKUP_EXCLUDED_KEYS: ReadonlySet<string> = new Set<string>([
  STORAGE_KEYS.SYNC_META,
  STORAGE_KEYS.SYNC_BASELINE,
]);
```

`saveJson` にフックを足す:

```ts
type SaveListener = (key: string) => void;

const saveListeners = new Set<SaveListener>();

/**
 * saveJson による保存を購読する。戻り値を呼ぶと購読を解除する。
 *
 * 同期層がここを一方的に購読することで、既存の 13 箇所の saveJson 呼び出しを
 * 一切変更せずに全変更を捕捉できる。storage.ts は同期層を知らない（片方向依存）。
 */
export function onSave(listener: SaveListener): () => void {
  saveListeners.add(listener);
  return () => {
    saveListeners.delete(listener);
  };
}

export function saveJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota 超過 / プライベートモード等は無視。書けていないので通知もしない
    return;
  }
  for (const listener of saveListeners) {
    try {
      listener(key);
    } catch {
      // 購読側の例外で保存処理を壊さない
    }
  }
}

/**
 * 通知せずに書き込み、成否を返す。同期層がサーバから取り込んだ内容を書き戻すのに使う。
 *
 * `saveJson` では 2 つ問題がある:
 *   (a) 例外を飲むため書き込み失敗を検知できない。失敗を見逃すと「ベースラインは
 *       取り込み済みなのにローカルは古い」状態になり、次の同期で古いローカルの値が
 *       相手の新しい値を上書きする。
 *   (b) `onSave` が発火し、同期層自身の書き込みが「未同期のローカル変更」として
 *       扱われる。同期 → 保存通知 → 同期のループになりうる。
 */
export function writeJsonSilently(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/storage.test.ts`
Expected: PASS（既存テスト + 新規 6 tests）

- [ ] **Step 5: `FooterTools.svelte` のエクスポートから除外キーを外す**

`src/components/FooterTools.svelte:29` 付近のループを変更する:

```svelte
    for (const key of Object.values(STORAGE_KEYS)) {
      if (BACKUP_EXCLUDED_KEYS.has(key)) continue;
      data[key] = localStorage.getItem(key);
    }
```

import 行に `BACKUP_EXCLUDED_KEYS` を足す:

```ts
  import { STORAGE_KEYS, BACKUP_EXCLUDED_KEYS } from '../lib/storage';
```

- [ ] **Step 6: インポート復元後にイベントを発火する**

`src/components/FooterTools.svelte:96` の復元ループの直後（`localStorage.setItem(key, value);` を回し終えた後）に追加する:

```ts
      // 同期層へ「ローカルが外部から書き換わった」ことを伝える。
      // ベースラインが実態と合わなくなるため、SyncPanel 側で同期状態をリセットさせる。
      // ここで sync 層を import しないのは、既存コンポーネントが同期層に依存しないため
      // （同期層を削除しても FooterTools が壊れない）。
      window.dispatchEvent(new CustomEvent('i7:backup-imported'));
```

同ループの `validKeys` 判定も除外キーを弾くようにする（他端末のバックアップに混ざっていても取り込まない）:

```ts
    const validKeys = new Set<string>(
      Object.values(STORAGE_KEYS).filter((key) => !BACKUP_EXCLUDED_KEYS.has(key)),
    );
```

- [ ] **Step 7: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: すべてエラーなし。カバレッジしきい値も維持されていること

- [ ] **Step 8: commit**

```bash
git add src/lib/storage.ts src/components/FooterTools.svelte tests/unit/storage.test.ts
git commit -m "feat(sync): saveJson の変更通知フックとバックアップ除外を追加する (ADR 0064)"
```

---

### Task 9: ベースラインと同期メタの永続化

**Files:**
- Create: `src/lib/sync/baseline.ts`
- Create: `src/lib/sync/syncMeta.ts`
- Test: `tests/unit/sync/baseline.test.ts`
- Test: `tests/unit/sync/syncMeta.test.ts`

**Interfaces:**
- Consumes: `RowSet` (Task 3), `STORAGE_KEYS` (Task 8)
- Produces:
  - `type BaselineKind = 'card_counts' | 'shared_broach_counts' | 'rabbit_notes' | 'decks'`
  - `loadBaselineRowSet<V>(kind: BaselineKind): RowSet<V>`
  - `commitBaselineRow(kind: BaselineKind, key: string, value: unknown): boolean`
  - `clearBaseline(): boolean`
  - `type SyncMeta = { userId: string | null; cursorRev: number; lastSyncedAt: number | null }`
  - `loadSyncMeta()` / `saveSyncMeta(meta)` / `resetSyncState()`
  - `nextCursorRev(current: number, appliedRevs: readonly number[]): number`
  - `reconcileUser(meta: SyncMeta, userId: string): SyncMeta | null`（`null` = 突き合わせに失敗。呼び出し側は同期を中止する）

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/sync/baseline.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  clearBaseline, commitBaselineRow, loadBaselineRowSet,
} from '../../../src/lib/sync/baseline';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('loadBaselineRowSet', () => {
  it('未保存なら空の行集合', () => {
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('壊れた JSON でも空の行集合を返す', () => {
    localStorage.setItem(STORAGE_KEYS.SYNC_BASELINE, '{壊れている');
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});

describe('commitBaselineRow', () => {
  it('1 行だけ追加できる', () => {
    expect(commitBaselineRow('card_counts', '5', 2)).toBe(true);
    expect([...loadBaselineRowSet<number>('card_counts')]).toEqual([['5', 2]]);
  });

  it('null を渡すとその行を削除する', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('card_counts', '5', null);
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('同じ kind の他の行に影響しない', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('card_counts', '6', 3);
    commitBaselineRow('card_counts', '5', null);
    expect([...loadBaselineRowSet<number>('card_counts')]).toEqual([['6', 3]]);
  });

  it('他の kind に影響しない', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('decks', 'd1', { name: 'A' });
    expect(loadBaselineRowSet('card_counts').size).toBe(1);
    expect(loadBaselineRowSet('decks').size).toBe(1);
  });

  it('保存に失敗したら false を返す (呼び出し側が同期を無効化できるように)', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(commitBaselineRow('card_counts', '5', 2)).toBe(false);
  });
});

describe('clearBaseline', () => {
  it('全 kind を空にする', () => {
    commitBaselineRow('card_counts', '5', 2);
    commitBaselineRow('decks', 'd1', { name: 'A' });
    clearBaseline();
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
    expect(loadBaselineRowSet('decks').size).toBe(0);
  });
});
```

`tests/unit/sync/syncMeta.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadSyncMeta, nextCursorRev, reconcileUser, resetSyncState, saveSyncMeta,
} from '../../../src/lib/sync/syncMeta';
import { commitBaselineRow, loadBaselineRowSet } from '../../../src/lib/sync/baseline';

beforeEach(() => localStorage.clear());

describe('loadSyncMeta / saveSyncMeta', () => {
  it('未保存なら初期値', () => {
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
  });

  it('保存した値を読み戻せる', () => {
    saveSyncMeta({ userId: 'u1', cursorRev: 12, lastSyncedAt: 1000 });
    expect(loadSyncMeta()).toEqual({ userId: 'u1', cursorRev: 12, lastSyncedAt: 1000 });
  });

  it('不正な形なら初期値に落とす', () => {
    localStorage.setItem('i7_sync_meta', '"文字列"');
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
  });
});

describe('nextCursorRev', () => {
  it('適用した行の rev の最大値を返す', () => {
    expect(nextCursorRev(5, [7, 9, 8])).toBe(9);
  });

  it('現在値より小さい rev しか無ければ現在値を保つ (後戻りしない)', () => {
    expect(nextCursorRev(10, [3, 4])).toBe(10);
  });

  it('適用行が無ければ現在値のまま', () => {
    expect(nextCursorRev(10, [])).toBe(10);
  });
});

describe('reconcileUser', () => {
  it('同じユーザーならメタをそのまま返す', () => {
    const meta = { userId: 'u1', cursorRev: 5, lastSyncedAt: 1 };
    expect(reconcileUser(meta, 'u1')).toEqual(meta);
  });

  it('別ユーザーならカーソルを 0 に戻しベースラインを捨てる (初回リンク扱い)', () => {
    commitBaselineRow('card_counts', '5', 2);
    saveSyncMeta({ userId: 'u1', cursorRev: 5, lastSyncedAt: 1 });
    const next = reconcileUser(loadSyncMeta(), 'u2');
    expect(next).toEqual({ userId: 'u2', cursorRev: 0, lastSyncedAt: null });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('初回 (userId が null) もベースラインを捨てて初回リンク扱いにする', () => {
    commitBaselineRow('card_counts', '5', 2);
    const next = reconcileUser(loadSyncMeta(), 'u1');
    expect(next.cursorRev).toBe(0);
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});

describe('resetSyncState', () => {
  it('メタとベースラインの両方を消す', () => {
    saveSyncMeta({ userId: 'u1', cursorRev: 5, lastSyncedAt: 1 });
    commitBaselineRow('card_counts', '5', 2);
    resetSyncState();
    expect(loadSyncMeta()).toEqual({ userId: null, cursorRev: 0, lastSyncedAt: null });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/baseline.test.ts tests/unit/sync/syncMeta.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: `baseline.ts` を実装する**

```ts
import { STORAGE_KEYS, loadJson, saveJson } from '../storage';
import type { RowSet } from './rows';

export type BaselineKind = 'card_counts' | 'shared_broach_counts' | 'rabbit_notes' | 'decks';

const KINDS: readonly BaselineKind[] = ['card_counts', 'shared_broach_counts', 'rabbit_notes', 'decks'];

type BaselineStore = Partial<Record<BaselineKind, Record<string, unknown>>>;

function load(): BaselineStore {
  const raw = loadJson<unknown>(STORAGE_KEYS.SYNC_BASELINE, {});
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as BaselineStore)
    : {};
}

/** 「最後にサーバと一致していると確認できた行集合」を読む */
export function loadBaselineRowSet<V>(kind: BaselineKind): RowSet<V> {
  const bucket = load()[kind];
  if (!bucket || typeof bucket !== 'object') return new Map();
  return new Map(Object.entries(bucket) as [string, V][]);
}

/**
 * ベースラインを **1 行だけ** 更新する。null を渡すとその行を削除する。
 * 保存に失敗したら false を返す。
 *
 * 行単位の API しか公開しないのは、一括更新を構造的に不可能にするため。
 * 部分失敗時に「サーバへの反映が確認できた行だけ」を進める必要があり、
 * 一括更新すると失敗した行まで同期済みとして扱ってしまう（ADR 0064 決定 6）。
 */
export function commitBaselineRow(kind: BaselineKind, key: string, value: unknown): boolean {
  const store = load();
  const bucket = { ...(store[kind] ?? {}) };
  if (value === null) {
    delete bucket[key];
  } else {
    bucket[key] = value;
  }
  const next: BaselineStore = { ...store, [kind]: bucket };
  try {
    localStorage.setItem(STORAGE_KEYS.SYNC_BASELINE, JSON.stringify(next));
    return true;
  } catch {
    // quota 超過。呼び出し側は同期を無効化してエラー表示すること（勝手なマージに倒さない）
    return false;
  }
}

export function clearBaseline(): void {
  saveJson(STORAGE_KEYS.SYNC_BASELINE, Object.fromEntries(KINDS.map((kind) => [kind, {}])));
}
```

> `saveJson` ではなく `localStorage.setItem` を直に使うのは、失敗を戻り値で伝えるため（`saveJson` は例外を飲む）。`STORAGE_KEYS.SYNC_BASELINE` は同期対象キーではないので、`onSave` の購読側で無視され再帰は起きない。

- [ ] **Step 4: `syncMeta.ts` を実装する**

```ts
import { STORAGE_KEYS, loadJson, saveJson } from '../storage';
import { clearBaseline } from './baseline';

export type SyncMeta = {
  userId: string | null;
  cursorRev: number;
  lastSyncedAt: number | null;
};

export const EMPTY_SYNC_META: SyncMeta = { userId: null, cursorRev: 0, lastSyncedAt: null };

export function loadSyncMeta(): SyncMeta {
  const raw = loadJson<unknown>(STORAGE_KEYS.SYNC_META, EMPTY_SYNC_META);
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...EMPTY_SYNC_META };
  const meta = raw as Partial<SyncMeta>;
  return {
    userId: typeof meta.userId === 'string' ? meta.userId : null,
    cursorRev: Number.isFinite(meta.cursorRev) ? Number(meta.cursorRev) : 0,
    lastSyncedAt: Number.isFinite(meta.lastSyncedAt) ? Number(meta.lastSyncedAt) : null,
  };
}

export function saveSyncMeta(meta: SyncMeta): void {
  saveJson(STORAGE_KEYS.SYNC_META, meta);
}

/**
 * 次のカーソル値。「実際に適用した行の rev の最大値」を採る。
 *
 * sync_cursor.rev を読んで採用すると、プルの途中で別端末の書き込みが入った場合に
 * 未取得の行を飛ばす。最大値方式なら最悪でも次回に再取得するだけで取りこぼさない。
 */
export function nextCursorRev(current: number, appliedRevs: readonly number[]): number {
  return appliedRevs.reduce((max, rev) => (rev > max ? rev : max), current);
}

/**
 * ログイン中のユーザーとメタの userId を突き合わせる。
 * 不一致（別アカウントへの切替、初回）ならベースラインとカーソルを捨てて初回リンク扱いに戻す。
 */
export function reconcileUser(meta: SyncMeta, userId: string): SyncMeta {
  if (meta.userId === userId) return meta;
  clearBaseline();
  const next: SyncMeta = { userId, cursorRev: 0, lastSyncedAt: null };
  saveSyncMeta(next);
  return next;
}

/** バックアップ復元後など、ローカルが外部から書き換わったときに呼ぶ */
export function resetSyncState(): void {
  clearBaseline();
  saveSyncMeta({ ...EMPTY_SYNC_META });
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/baseline.test.ts tests/unit/sync/syncMeta.test.ts`
Expected: PASS（baseline 8 tests / syncMeta 10 tests）

- [ ] **Step 6: commit**

```bash
git add src/lib/sync/baseline.ts src/lib/sync/syncMeta.ts tests/unit/sync/baseline.test.ts tests/unit/sync/syncMeta.test.ts
git commit -m "feat(sync): ベースラインと同期メタの永続化を追加する (ADR 0064)"
```

---

### Task 10: `SyncPort` とその supabase-js 実装

同期エンジンが依存する境界をここで固定する。**PostgREST を知っているのは `supabasePort.ts` だけ**にすることで、エンジン側は実 Supabase なしでテストできる。

**Files:**
- Create: `src/lib/sync/port.ts`
- Create: `src/lib/sync/supabasePort.ts`

**Interfaces:**
- Consumes: 行の型 (Task 3)、`RabbitNoteValue` (Task 4)、`SyncedDeck` (Task 5)
- Produces:
  - `type CountTable = 'card_counts' | 'shared_broach_counts'`
  - `type PulledRows` / `type PushResult`
  - `interface SyncPort`
  - `createSupabasePort(client: SupabaseClient): SyncPort`

- [ ] **Step 1: `port.ts` を書く（型のみ。テスト不要）**

```ts
import type { SyncedDeck } from './projection/decks';
import type { RabbitNoteValue } from './projection/rabbitNotes';
import type {
  CardCountRow, DeckRow, DeckSlotRow, RabbitNoteRow, SharedBroachCountRow,
} from './rows';

export type CountTable = 'card_counts' | 'shared_broach_counts';

export type PulledRows = {
  card_counts: CardCountRow[];
  shared_broach_counts: SharedBroachCountRow[];
  rabbit_notes: RabbitNoteRow[];
  decks: DeckRow[];
  deck_slots: DeckSlotRow[];
};

export type PushResult = { ok: true; rev: number } | { ok: false; error: string };

/**
 * 同期に必要な操作だけを宣言した境界。
 *
 * push 系が「キー → 結果」の Map を返すのが要点。ベースラインは
 * サーバへの反映が確認できた行だけを行単位で進める必要があるため、
 * 一括の成否ではなく行ごとの結果が必要になる（ADR 0064 決定 6）。
 */
export interface SyncPort {
  getUserId(): Promise<string | null>;
  pull(cursorRev: number): Promise<PulledRows>;
  pushCounts(
    table: CountTable,
    rows: readonly { key: string; count: number }[],
  ): Promise<Map<string, PushResult>>;
  pushRabbitNotes(
    rows: readonly { key: string; value: RabbitNoteValue }[],
  ): Promise<Map<string, PushResult>>;
  /** デッキは decks 1 行 + deck_slots 6 行なので RPC で 1 トランザクションにする */
  pushDeck(key: string, deck: SyncedDeck): Promise<PushResult>;
  deleteAll(): Promise<void>;
}
```

- [ ] **Step 2: `supabasePort.ts` を書く**

```ts
/* v8 ignore start -- PostgREST への実接続のみ。判定ロジックは syncEngine 側でテストしている */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SyncedDeck } from './projection/decks';
import type { RabbitNoteValue } from './projection/rabbitNotes';
import type { CountTable, PulledRows, PushResult, SyncPort } from './port';

const ID_COLUMN: Record<CountTable, 'card_id' | 'broach_id'> = {
  card_counts: 'card_id',
  shared_broach_counts: 'broach_id',
};

export function createSupabasePort(client: SupabaseClient): SyncPort {
  async function currentUserId(): Promise<string | null> {
    const { data } = await client.auth.getUser();
    return data.user?.id ?? null;
  }

  function allFailed(keys: readonly string[], error: string): Map<string, PushResult> {
    return new Map(keys.map((key) => [key, { ok: false, error }]));
  }

  return {
    getUserId: currentUserId,

    async pull(cursorRev) {
      const [cards, broachs, notes, decks] = await Promise.all([
        client.from('card_counts').select('*').gt('rev', cursorRev),
        client.from('shared_broach_counts').select('*').gt('rev', cursorRev),
        client.from('rabbit_notes').select('*').gt('rev', cursorRev),
        client.from('decks').select('*').gt('rev', cursorRev),
      ]);
      for (const result of [cards, broachs, notes, decks]) {
        if (result.error) throw new Error(result.error.message);
      }

      const deckRows = (decks.data ?? []) as PulledRows['decks'];
      let slotRows: PulledRows['deck_slots'] = [];
      if (deckRows.length > 0) {
        const slots = await client.from('deck_slots').select('*')
          .in('deck_id', deckRows.map((deck) => deck.id));
        if (slots.error) throw new Error(slots.error.message);
        slotRows = (slots.data ?? []) as PulledRows['deck_slots'];
      }

      return {
        card_counts: (cards.data ?? []) as PulledRows['card_counts'],
        shared_broach_counts: (broachs.data ?? []) as PulledRows['shared_broach_counts'],
        rabbit_notes: (notes.data ?? []) as PulledRows['rabbit_notes'],
        decks: deckRows,
        deck_slots: slotRows,
      };
    },

    async pushCounts(table, rows) {
      if (rows.length === 0) return new Map();
      const keys = rows.map((row) => row.key);
      const userId = await currentUserId();
      if (userId === null) return allFailed(keys, 'not authenticated');

      const idColumn = ID_COLUMN[table];
      const payload = rows.map((row) => ({
        user_id: userId,
        [idColumn]: Number(row.key),
        count: row.count,
      }));

      const { data, error } = await client.from(table)
        .upsert(payload, { onConflict: `user_id,${idColumn}` })
        .select(`${idColumn}, rev`);
      if (error) return allFailed(keys, error.message);

      const out = new Map<string, PushResult>();
      for (const row of (data ?? []) as Record<string, unknown>[]) {
        out.set(String(row[idColumn]), { ok: true, rev: Number(row.rev) });
      }
      // 返ってこなかった行はベースラインを進めない
      for (const key of keys) {
        if (!out.has(key)) out.set(key, { ok: false, error: 'not returned by server' });
      }
      return out;
    },

    async pushRabbitNotes(rows) {
      if (rows.length === 0) return new Map();
      const keys = rows.map((row) => row.key);
      const userId = await currentUserId();
      if (userId === null) return allFailed(keys, 'not authenticated');

      const payload = rows.map(({ key, value }) => ({
        user_id: userId, character: key,
        shout: value.shout, beat: value.beat, melody: value.melody,
      }));

      const { data, error } = await client.from('rabbit_notes')
        .upsert(payload, { onConflict: 'user_id,character' })
        .select('character, rev');
      if (error) return allFailed(keys, error.message);

      const out = new Map<string, PushResult>();
      for (const row of (data ?? []) as { character: string; rev: number }[]) {
        out.set(row.character, { ok: true, rev: Number(row.rev) });
      }
      for (const key of keys) {
        if (!out.has(key)) out.set(key, { ok: false, error: 'not returned by server' });
      }
      return out;
    },

    async pushDeck(key, deck: SyncedDeck) {
      const { data, error } = await client.rpc('upsert_deck', {
        payload: {
          id: key,
          name: deck.name,
          song_id: deck.song_id,
          created_at: deck.created_at,
          deleted_at: deck.deleted_at,
          slots: deck.slots,
        },
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true, rev: Number(data) };
    },

    async deleteAll() {
      const { error } = await client.rpc('delete_all_sync_data');
      if (error) throw new Error(error.message);
    },
  };
}
/* v8 ignore stop */
```

- [ ] **Step 3: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 4: カバレッジが維持されていることを確認する**

Run: `npm run coverage`
Expected: `src/lib/**` のしきい値 95% を維持（`supabasePort.ts` は `/* v8 ignore */` で除外されている）

- [ ] **Step 5: commit**

```bash
git add src/lib/sync/port.ts src/lib/sync/supabasePort.ts
git commit -m "feat(sync): SyncPort と supabase-js 実装を追加する (ADR 0064)"
```

---

### Task 11: データ種別アダプタと同期プラン

localStorage 側とサーバ側の差異をデータ種別ごとに吸収する層。`runSync`（Task 12）はこの層の上でデータ種別を意識せずに回る。

**Files:**
- Create: `src/lib/sync/adapters.ts`
- Test: `tests/unit/sync/adapters.test.ts`

**Interfaces:**
- Consumes: 全プロジェクション (Task 3-5)、`merge` (Task 7)、`baseline` (Task 9)、`SyncPort` (Task 10)
- Produces:
  - `clampRowSet(rows: RowSet<number>, max: number): RowSet<number>`
  - `hasPendingLocalChanges(): boolean`
  - `type Adapter<V>`、`ADAPTERS: readonly Adapter<unknown>[]`、`findAdapter(kind): Adapter<unknown>`
  - `type KindPlan = { kind: BaselineKind; verdicts: MergeVerdict<unknown>[]; conflictKeys: string[]; serverRevs: number[] }`
  - `planKind<V>(adapter: Adapter<V>, pulled: PulledRows): KindPlan`

- [ ] **Step 1: 失敗するテストを書く**

`tests/unit/sync/adapters.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  ADAPTERS, clampRowSet, findAdapter, hasPendingLocalChanges, planKind,
} from '../../../src/lib/sync/adapters';
import { commitBaselineRow } from '../../../src/lib/sync/baseline';
import { STORAGE_KEYS, saveJson } from '../../../src/lib/storage';
import type { PulledRows } from '../../../src/lib/sync/port';

const EMPTY_PULL: PulledRows = {
  card_counts: [], shared_broach_counts: [], rabbit_notes: [], decks: [], deck_slots: [],
};

beforeEach(() => localStorage.clear());

describe('clampRowSet', () => {
  it('上限を超える値を丸める', () => {
    expect([...clampRowSet(new Map([['a', 15], ['b', 3]]), 10)]).toEqual([['a', 10], ['b', 3]]);
  });

  it('上限以下はそのまま', () => {
    expect([...clampRowSet(new Map([['a', 10]]), 10)]).toEqual([['a', 10]]);
  });
});

describe('ADAPTERS', () => {
  it('4 つのデータ種別を網羅している', () => {
    expect(ADAPTERS.map((a) => a.kind)).toEqual([
      'card_counts', 'shared_broach_counts', 'rabbit_notes', 'decks',
    ]);
  });
});

describe('planKind (card_counts)', () => {
  it('ローカルだけに変更があれば push の判定になる', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const plan = planKind(findAdapter('card_counts'), EMPTY_PULL);
    expect(plan.conflictKeys).toEqual([]);
    expect(plan.verdicts).toEqual([{ kind: 'push', key: '5', value: 2 }]);
  });

  it('サーバだけに変更があれば adopt の判定になる', () => {
    const pulled: PulledRows = {
      ...EMPTY_PULL,
      card_counts: [{ user_id: 'u', card_id: 5, count: 3, rev: 7, updated_at: '2026-08-31T00:00:00Z' }],
    };
    const plan = planKind(findAdapter('card_counts'), pulled);
    expect(plan.verdicts).toEqual([{ kind: 'adopt', key: '5', value: 3 }]);
    expect(plan.serverRevs).toEqual([7]);
  });

  it('ベースラインと一致していれば noop になる', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    commitBaselineRow('card_counts', '5', 2);
    const plan = planKind(findAdapter('card_counts'), EMPTY_PULL);
    expect(plan.verdicts).toEqual([{ kind: 'noop', key: '5', value: 2 }]);
  });

  it('両方が別々に変わっていれば競合キーとして返す', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const pulled: PulledRows = {
      ...EMPTY_PULL,
      card_counts: [{ user_id: 'u', card_id: 5, count: 8, rev: 7, updated_at: '2026-08-31T00:00:00Z' }],
    };
    const plan = planKind(findAdapter('card_counts'), pulled);
    expect(plan.conflictKeys).toEqual(['5']);
  });
});

describe('planKind — 差分プルの扱い（重要）', () => {
  it('差分に現れない行は「未変更」と扱う（サーバ削除と誤認してローカルを消さない）', () => {
    // 前回同期済みの状態: ローカルとベースラインが一致し、サーバからは差分が来ない
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    commitBaselineRow('card_counts', '5', 2);
    const plan = planKind(findAdapter('card_counts'), EMPTY_PULL);
    expect(plan.verdicts).toEqual([{ kind: 'noop', key: '5', value: 2 }]);
  });
});

describe('planKind (shared_broach_counts)', () => {
  it('ローカルもサーバも上限 10 に丸めるため、超過値で競合が起きない', () => {
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, { '1': 15 });
    const pulled: PulledRows = {
      ...EMPTY_PULL,
      shared_broach_counts: [{ user_id: 'u', broach_id: 1, count: 20, rev: 3, updated_at: '2026-08-31T00:00:00Z' }],
    };
    const plan = planKind(findAdapter('shared_broach_counts'), pulled);
    expect(plan.conflictKeys).toEqual([]);
    expect(plan.verdicts).toEqual([{ kind: 'noop', key: '1', value: 10 }]);
  });
});

describe('hasPendingLocalChanges', () => {
  it('ベースラインと一致していれば false', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    commitBaselineRow('card_counts', '5', 2);
    expect(hasPendingLocalChanges()).toBe(false);
  });

  it('ベースラインに無いローカル変更があれば true', () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    expect(hasPendingLocalChanges()).toBe(true);
  });

  it('何も無ければ false', () => {
    expect(hasPendingLocalChanges()).toBe(false);
  });
});

describe('adapter.writeLocal', () => {
  it('card_counts の書き戻しでストアも更新される', async () => {
    const { getCount } = await import('../../../src/lib/stores/cardCounts.svelte');
    findAdapter('card_counts').writeLocal(new Map([['5', 4]]) as never);
    expect(getCount(5)).toBe(4);
  });

  it('decks の書き戻しで localStorage が SavedDeck[] の形になる', async () => {
    const { savedDecksToRowSet } = await import('../../../src/lib/sync/projection/decks');
    const deck = {
      id: 'd1', name: 'A', createdAt: 1000, updatedAt: 2000,
      state: {
        songId: null, deckIds: [1, null, null, null, null, null],
        bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [],
      },
    };
    findAdapter('decks').writeLocal(savedDecksToRowSet([deck]) as never);
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.SAVED_DECKS) ?? '[]');
    expect(stored).toHaveLength(1);
    expect(stored[0].id).toBe('d1');
    expect(stored[0].state.deckIds[0]).toBe(1);
  });
});
```

- [ ] **Step 2: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/adapters.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 3: `adapters.ts` を実装する**

```ts
import { loadRabbitNotes } from '../data/rabbitNote';
import { STORAGE_KEYS, loadJson, writeJsonSilently } from '../storage';
import { MAX_BROACH_COUNT, reloadBroachCountsFromStorage } from '../stores/broachCounts.svelte';
import { reloadFromStorage as reloadCardCounts } from '../stores/cardCounts.svelte';
import { loadBaselineRowSet, type BaselineKind } from './baseline';
import { diffRowSets, hasChanges } from './diff';
import { mergeRowSets, type MergeVerdict } from './merge';
import type { PulledRows, PushResult, SyncPort } from './port';
import {
  countMapToRowSet, countRowsToRowSet, rowSetToCountMap, type CountMap,
} from './projection/countMap';
import {
  deckEquals, deckRowsToRowSet, rowSetToSavedDecks, savedDecksToRowSet,
  type SavedDeck, type SyncedDeck,
} from './projection/decks';
import {
  rabbitEquals, rabbitMapToRowSet, rabbitRowsToRowSet, rowSetToRabbitMap,
  type RabbitNoteValue,
} from './projection/rabbitNotes';
import type { RowSet } from './rows';

/** 上限のある値（共通ブローチ）を丸める。ローカル側とサーバ側の両方に同じ丸めを掛けること */
export function clampRowSet(rows: RowSet<number>, max: number): RowSet<number> {
  return new Map([...rows].map(([key, value]) => [key, Math.min(value, max)]));
}

export type Adapter<V> = {
  kind: BaselineKind;
  /** localStorage の現在値 */
  localRowSet(): RowSet<V>;
  /**
   * localStorage へ書き戻す。関連する Svelte ストアの再読込もここで行う。
   * 書き込みに失敗したら false を返すこと（呼び出し側は同期を停止する）。
   */
  writeLocal(rows: RowSet<V>): boolean;
  /**
   * ローカル表現が「その行が無い」と「ゼロ値」を区別できない種別のための補正。
   *
   * 所持数系は 0 のキーを localStorage から落とすため、削除した行は
   * ローカルでは常に「無い」= null になる。一方サーバには 0 の行が残る。
   * 補正しないと baseline=0 / local=null が永久に一致せず、push と adopt を
   * 往復し続ける（周期 2 の無限ループ）。
   *
   * 引数はベースラインが持っている値。null を返すと「本当に無い」として扱われ、
   * 通常の削除として push される。
   */
  absentLocalAs?: (other: V) => V | null;
  /** プル結果からサーバ側の行集合を作る */
  serverRowSet(pulled: PulledRows): RowSet<V>;
  /** カーソル更新に使う、プルで得た rev の一覧 */
  serverRevs(pulled: PulledRows): number[];
  equals(a: V, b: V): boolean;
  /** null は削除を意味する（所持数系は 0、デッキは deleted_at） */
  push(port: SyncPort, entries: readonly [string, V | null][]): Promise<Map<string, PushResult>>;
};

const cardCountsAdapter: Adapter<number> = {
  kind: 'card_counts',
  localRowSet: () => countMapToRowSet(loadJson<CountMap>(STORAGE_KEYS.CARD_COUNTS, {})),
  writeLocal(rows) {
    const ok = writeJsonSilently(STORAGE_KEYS.CARD_COUNTS, rowSetToCountMap(rows));
    if (ok) reloadCardCounts();
    return ok;
  },
  // rowSetToCountMap が 0 を落とすため、ローカルは 0 と不在を区別できない
  absentLocalAs: () => 0,
  serverRowSet: (pulled) => countRowsToRowSet(pulled.card_counts, 'card_id'),
  serverRevs: (pulled) => pulled.card_counts.map((row) => row.rev),
  equals: (a, b) => a === b,
  push: (port, entries) =>
    port.pushCounts('card_counts', entries.map(([key, value]) => ({ key, count: value ?? 0 }))),
};

const sharedBroachCountsAdapter: Adapter<number> = {
  kind: 'shared_broach_counts',
  // 共通ブローチは所持上限 10（broachCounts ストアの MAX_BROACH_COUNT）。
  // ローカル・サーバの両方に同じ丸めを掛けないと、超過値が永遠に差分として残る
  localRowSet: () =>
    clampRowSet(
      countMapToRowSet(loadJson<CountMap>(STORAGE_KEYS.SHARED_BROACH_COUNTS, {})),
      MAX_BROACH_COUNT,
    ),
  writeLocal(rows) {
    const ok = writeJsonSilently(
      STORAGE_KEYS.SHARED_BROACH_COUNTS,
      rowSetToCountMap(clampRowSet(rows, MAX_BROACH_COUNT)),
    );
    if (ok) reloadBroachCountsFromStorage();
    return ok;
  },
  absentLocalAs: () => 0,
  serverRowSet: (pulled) =>
    clampRowSet(countRowsToRowSet(pulled.shared_broach_counts, 'broach_id'), MAX_BROACH_COUNT),
  serverRevs: (pulled) => pulled.shared_broach_counts.map((row) => row.rev),
  equals: (a, b) => a === b,
  push: (port, entries) =>
    port.pushCounts(
      'shared_broach_counts',
      entries.map(([key, value]) => ({ key, count: Math.min(value ?? 0, MAX_BROACH_COUNT) })),
    ),
};

const ZERO_NOTE: RabbitNoteValue = { shout: 0, beat: 0, melody: 0 };

const rabbitNotesAdapter: Adapter<RabbitNoteValue> = {
  kind: 'rabbit_notes',
  localRowSet: () => rabbitMapToRowSet(loadRabbitNotes()),
  writeLocal: (rows) => writeJsonSilently(STORAGE_KEYS.RABBIT_NOTES, rowSetToRabbitMap(rows)),
  absentLocalAs: () => ZERO_NOTE,
  serverRowSet: (pulled) => rabbitRowsToRowSet(pulled.rabbit_notes),
  serverRevs: (pulled) => pulled.rabbit_notes.map((row) => row.rev),
  equals: rabbitEquals,
  push: (port, entries) =>
    port.pushRabbitNotes(entries.map(([key, value]) => ({ key, value: value ?? ZERO_NOTE }))),
};

const decksAdapter: Adapter<SyncedDeck> = {
  kind: 'decks',
  localRowSet: () => savedDecksToRowSet(loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, [])),
  writeLocal: (rows) => writeJsonSilently(STORAGE_KEYS.SAVED_DECKS, rowSetToSavedDecks(rows)),
  // tombstone 済みのデッキはローカルに現れない（rowSetToSavedDecks が飛ばす）ので、
  // 相手が tombstone を持っているなら「ローカルに無い」は同じ状態を意味する。
  // 相手が生きているデッキを持っているなら、本当に削除された（push すべき）
  absentLocalAs: (other) => (other.deleted_at === null ? null : other),
  serverRowSet: (pulled) => deckRowsToRowSet(pulled.decks, pulled.deck_slots),
  serverRevs: (pulled) => pulled.decks.map((row) => row.rev),
  equals: deckEquals,
  async push(port, entries) {
    const out = new Map<string, PushResult>();
    for (const [key, value] of entries) {
      // 削除は tombstone。行を消すと「まだ作っていない」と区別できなくなる
      const deck: SyncedDeck = value ?? {
        name: '(deleted)', song_id: null,
        created_at: new Date(0).toISOString(), updated_at: new Date(0).toISOString(),
        deleted_at: new Date().toISOString(), slots: [],
      };
      const payload = value === null ? deck : { ...deck, deleted_at: null };
      out.set(key, await port.pushDeck(key, payload));
    }
    return out;
  },
};

// V の異なるアダプタを 1 つの配列に入れるためのキャスト。`Map<string, V>` は V に対して
// 不変なので、キャストなしでは要素を代入できない。
// never ではなく unknown を使うこと: MergeVerdict<never> は value: never | null が
// null に潰れ、「verdict は値を運ばない」という嘘の型になる。
export const ADAPTERS: readonly Adapter<unknown>[] = [
  cardCountsAdapter, sharedBroachCountsAdapter, rabbitNotesAdapter, decksAdapter,
] as unknown as readonly Adapter<unknown>[];

export function findAdapter(kind: BaselineKind): Adapter<unknown> {
  const adapter = ADAPTERS.find((candidate) => candidate.kind === kind);
  /* v8 ignore next -- BaselineKind は ADAPTERS を網羅しており到達しない */
  if (!adapter) throw new Error(`unknown sync kind: ${kind}`);
  return adapter;
}

/**
 * 同期を走らせずに「未同期のローカル変更があるか」を判定する。
 *
 * SyncPanel は mount 時にこれを見る。保存イベントだけに頼ると、
 * オフラインで変更したあとリロードした場合に未同期であることが表示されない。
 */
export function hasPendingLocalChanges(): boolean {
  return ADAPTERS.some((adapter) =>
    hasChanges(diffRowSets(
      loadBaselineRowSet(adapter.kind),
      adapter.localRowSet(),
      adapter.equals,
    )),
  );
}

export type KindPlan = {
  kind: BaselineKind;
  verdicts: MergeVerdict<unknown>[];
  conflictKeys: string[];
  serverRevs: number[];
};

/** ベースライン / ローカル / サーバの 3 値からデータ種別ごとの処分一覧を作る */
export function planKind<V>(adapter: Adapter<V>, pulled: PulledRows): KindPlan {
  const baseline = loadBaselineRowSet<V>(adapter.kind);

  // pull は rev > cursor の「差分」しか返さない。差分に現れない行を「サーバで削除された」と
  // 解釈すると、2 回目の同期で前回同期した行が adopt(null) = ローカル削除になり
  // 利用者のデータが消える。本設計では削除を行の欠落で表現していない
  // （所持数系は 0 を保持、デッキは deleted_at）ので、差分に無い行は「未変更」で確定できる。
  // したがってサーバ側の状態は「ベースライン ∪ 差分」として組む。
  const server: RowSet<V> = new Map(baseline);
  for (const [key, value] of adapter.serverRowSet(pulled)) server.set(key, value);

  // ローカル表現がゼロ値を表せない種別では「ローカルに無い」をゼロ値へ補正する。
  // これをしないと削除した行が baseline=0 / local=null で永久に一致せず、
  // push と adopt を往復し続ける
  const local = new Map(adapter.localRowSet());
  if (adapter.absentLocalAs !== undefined) {
    // **ベースラインにある行だけ**を対象にする。ベースラインに無い行は
    // 「サーバで新しく作られ、この端末はまだ知らない行」であり、ローカルに無いのは
    // 当然なので補正してはならない。補正すると初回の取り込みが
    // 「ローカルが 0 に変えた vs サーバが値を入れた」= 競合と誤判定される
    for (const [key, baseValue] of baseline) {
      if (!local.has(key)) {
        const substitute = adapter.absentLocalAs(baseValue);
        if (substitute !== null) local.set(key, substitute);
      }
    }
  }

  const verdicts = mergeRowSets<V>(baseline, local, server, adapter.equals);
  return {
    kind: adapter.kind,
    verdicts: verdicts as MergeVerdict<unknown>[],
    conflictKeys: verdicts.filter((v) => v.kind === 'conflict').map((v) => v.key),
    serverRevs: adapter.serverRevs(pulled),
  };
}
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/adapters.test.ts`
Expected: PASS（14 tests）

- [ ] **Step 5: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 6: commit**

```bash
git add src/lib/sync/adapters.ts tests/unit/sync/adapters.test.ts
git commit -m "feat(sync): データ種別アダプタと同期プランを追加する (ADR 0064)"
```

---

### Task 12: 同期のオーケストレーション

**Files:**
- Create: `src/lib/sync/syncEngine.ts`
- Create: `tests/unit/sync/fakePort.ts`
- Test: `tests/unit/sync/syncEngine.test.ts`

**Interfaces:**
- Consumes: `adapters` (Task 11)、`baseline` / `syncMeta` (Task 9)、`SyncPort` (Task 10)
- Produces:
  - `type Resolution = 'local' | 'server'`
  - `type ConflictResolver = (kinds: readonly BaselineKind[]) => Promise<Map<BaselineKind, Resolution>>`
  - `type SyncReport = { status; adopted; pushed; failed; unresolved; error? }`
  - `runSync(port: SyncPort, resolveConflicts: ConflictResolver): Promise<SyncReport>`

- [ ] **Step 1: インメモリの `SyncPort` を書く**

`tests/unit/sync/fakePort.ts`:

```ts
import type { PulledRows, PushResult, SyncPort } from '../../../src/lib/sync/port';
import type { SyncedDeck } from '../../../src/lib/sync/projection/decks';
import type { RabbitNoteValue } from '../../../src/lib/sync/projection/rabbitNotes';

type FakeOptions = {
  userId?: string | null;
  /** pull を失敗させる（オフラインの再現） */
  failPull?: boolean;
  /** このキーの push だけを失敗させる（部分失敗の再現） */
  failPushKeys?: Set<string>;
};

/**
 * Postgres が timestamptz を JSON へ描画する書式に寄せる。
 *
 * クライアントが送る `2026-08-31T00:00:00.000Z` は
 * `2026-08-31T00:00:00+00:00` として返ってくる。フェイクがクライアントの文字列を
 * そのまま返すと、生文字列比較に依存した実装（永久に再 push される）を
 * テストで検出できない。
 */
function pgTimestamp(iso: string): string {
  return new Date(iso).toISOString().replace(/\.\d{3}Z$/u, '+00:00');
}

export function createFakePort(options: FakeOptions = {}) {
  const userId = options.userId === undefined ? 'user-1' : options.userId;
  let rev = 0;
  const cardCounts = new Map<number, { count: number; rev: number }>();
  const broachCounts = new Map<number, { count: number; rev: number }>();
  const rabbitNotes = new Map<string, RabbitNoteValue & { rev: number }>();
  const decks = new Map<string, SyncedDeck & { rev: number }>();

  function bump(): number {
    rev += 1;
    return rev;
  }

  function result(key: string, nextRev: number): PushResult {
    return options.failPushKeys?.has(key)
      ? { ok: false, error: 'forced failure' }
      : { ok: true, rev: nextRev };
  }

  const port: SyncPort = {
    async getUserId() {
      return userId;
    },

    async pull(cursorRev) {
      if (options.failPull) throw new Error('network unreachable');
      const pulled: PulledRows = {
        card_counts: [...cardCounts].filter(([, v]) => v.rev > cursorRev).map(([card_id, v]) => ({
          user_id: 'user-1', card_id, count: v.count, rev: v.rev,
          updated_at: '2026-08-31T00:00:00.000Z',
        })),
        shared_broach_counts: [...broachCounts].filter(([, v]) => v.rev > cursorRev).map(([broach_id, v]) => ({
          user_id: 'user-1', broach_id, count: v.count, rev: v.rev,
          updated_at: '2026-08-31T00:00:00.000Z',
        })),
        rabbit_notes: [...rabbitNotes].filter(([, v]) => v.rev > cursorRev).map(([character, v]) => ({
          user_id: 'user-1', character, shout: v.shout, beat: v.beat, melody: v.melody,
          rev: v.rev, updated_at: '2026-08-31T00:00:00.000Z',
        })),
        decks: [...decks].filter(([, v]) => v.rev > cursorRev).map(([id, v]) => ({
          user_id: 'user-1', id, name: v.name, song_id: v.song_id,
          created_at: v.created_at, updated_at: v.updated_at, deleted_at: v.deleted_at, rev: v.rev,
        })),
        deck_slots: [],
      };
      for (const [id, deck] of decks) {
        if (deck.rev <= cursorRev) continue;
        for (const slot of deck.slots) {
          pulled.deck_slots.push({ user_id: 'user-1', deck_id: id, ...slot });
        }
      }
      return pulled;
    },

    async pushCounts(table, rows) {
      const store = table === 'card_counts' ? cardCounts : broachCounts;
      const out = new Map<string, PushResult>();
      for (const row of rows) {
        const outcome = result(row.key, bump());
        if (outcome.ok) store.set(Number(row.key), { count: row.count, rev: outcome.rev });
        out.set(row.key, outcome);
      }
      return out;
    },

    async pushRabbitNotes(rows) {
      const out = new Map<string, PushResult>();
      for (const row of rows) {
        const outcome = result(row.key, bump());
        if (outcome.ok) rabbitNotes.set(row.key, { ...row.value, rev: outcome.rev });
        out.set(row.key, outcome);
      }
      return out;
    },

    async pushDeck(key, deck) {
      const outcome = result(key, bump());
      if (outcome.ok) {
        const existing = decks.get(key);
        decks.set(key, {
          ...deck,
          // 実 RPC の on conflict は created_at を更新しない。既存行があれば保持する
          created_at: existing?.created_at ?? pgTimestamp(deck.created_at),
          // updated_at はサーバ側が採番する
          updated_at: pgTimestamp(new Date().toISOString()),
          deleted_at: deck.deleted_at === null ? null : pgTimestamp(deck.deleted_at),
          rev: outcome.rev,
        });
      }
      return outcome;
    },

    async deleteAll() {
      cardCounts.clear();
      broachCounts.clear();
      rabbitNotes.clear();
      decks.clear();
    },
  };

  /** テストからサーバ状態を直接仕込む（別端末の書き込みの再現） */
  function seedCardCount(cardId: number, count: number): void {
    cardCounts.set(cardId, { count, rev: bump() });
  }

  function seedBroachCount(broachId: number, count: number): void {
    broachCounts.set(broachId, { count, rev: bump() });
  }

  function seedRabbitNote(character: string, value: RabbitNoteValue): void {
    rabbitNotes.set(character, { ...value, rev: bump() });
  }

  return {
    port, seedCardCount, seedBroachCount, seedRabbitNote,
    state: { cardCounts, broachCounts, rabbitNotes, decks },
  };
}
```

- [ ] **Step 2: 失敗するテストを書く**

`tests/unit/sync/syncEngine.test.ts`:

```ts
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { runSync, type ConflictResolver } from '../../../src/lib/sync/syncEngine';
import { loadBaselineRowSet, commitBaselineRow } from '../../../src/lib/sync/baseline';
import { loadSyncMeta, saveSyncMeta } from '../../../src/lib/sync/syncMeta';
import { STORAGE_KEYS, loadJson, saveJson } from '../../../src/lib/storage';
import { createFakePort } from './fakePort';

const noConflict = async () => new Map();

/**
 * 「この端末は既にこのアカウントで同期済み」という状態を作る。
 *
 * ベースラインを仕込むテストでは必ず呼ぶこと。呼ばないと runSync の最初の
 * reconcileUser が「userId が null → 別アカウント」と判定してベースラインを
 * 破棄するため、3 値のうちベースラインが常に null になり、
 * 3-way マージを一度も検証しないテストになってしまう。
 */
function seedSyncedDevice(userId = 'user-1') {
  saveSyncMeta({ userId, cursorRev: 0, lastSyncedAt: null });
}

beforeEach(() => localStorage.clear());

describe('runSync — 認証とエラー', () => {
  it('未ログインなら何もせず unauthenticated を返す', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port } = createFakePort({ userId: null });
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('unauthenticated');
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 2 });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });

  it('pull が失敗したら localStorage を触らず error を返す', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port } = createFakePort({ failPull: true });
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('error');
    expect(report.error).toContain('network unreachable');
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 2 });
    expect(loadBaselineRowSet('card_counts').size).toBe(0);
  });
});

describe('runSync — push', () => {
  it('ローカルの変更をサーバへ送り、ベースラインを進める', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('ok');
    expect(report.pushed).toBe(1);
    expect(state.cardCounts.get(5)?.count).toBe(2);
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(2);
  });

  it('2 回目の同期では送るものが無い（べき等）', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const { port } = createFakePort();
    await runSync(port, noConflict);
    const second = await runSync(port, noConflict);
    expect(second.pushed).toBe(0);
    expect(second.adopted).toBe(0);
  });
});

describe('runSync — adopt', () => {
  it('サーバの変更を localStorage へ取り込む', async () => {
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 3);
    const report = await runSync(port, noConflict);
    expect(report.adopted).toBe(1);
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 3 });
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(3);
  });

  it('カーソルを適用した行の rev の最大値まで進める', async () => {
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 3);
    seedCardCount(6, 1);
    await runSync(port, noConflict);
    expect(loadSyncMeta().cursorRev).toBeGreaterThanOrEqual(2);
  });
});

describe('runSync — 共通ブローチとラビットノートの取り込み', () => {
  it('サーバの共通ブローチ所持数を取り込む', async () => {
    const { port, seedBroachCount } = createFakePort();
    seedBroachCount(1, 3);
    const report = await runSync(port, noConflict);
    expect(report.adopted).toBe(1);
    expect(loadJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, {})).toEqual({ '1': 3 });
  });

  it('サーバのラビットノートを取り込む', async () => {
    const { port, seedRabbitNote } = createFakePort();
    seedRabbitNote('七瀬陸', { shout: 1, beat: 2, melody: 3 });
    const report = await runSync(port, noConflict);
    expect(report.adopted).toBe(1);
    expect(loadJson(STORAGE_KEYS.RABBIT_NOTES, {}))
      .toEqual({ 七瀬陸: { shout: 1, beat: 2, melody: 3 } });
  });
});

describe('runSync — 競合', () => {
  it('この端末を選ぶとローカルの値が push される', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount, state } = createFakePort();
    seedCardCount(5, 8);
    const report = await runSync(port, async () => new Map([['card_counts', 'local']]));
    expect(report.status).toBe('ok');
    expect(state.cardCounts.get(5)?.count).toBe(9);
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 9 });
  });

  it('別の端末を選ぶとサーバの値が取り込まれる', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 8);
    const report = await runSync(port, async () => new Map([['card_counts', 'server']]));
    expect(report.status).toBe('ok');
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 8 });
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(8);
  });

  it('解決されなかったデータ種別は一切触らない（次回また聞く）', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount, state } = createFakePort();
    seedCardCount(5, 8);
    const report = await runSync(port, noConflict);
    expect(report.unresolved).toEqual(['card_counts']);
    expect(loadJson(STORAGE_KEYS.CARD_COUNTS, {})).toEqual({ '5': 9 });
    expect(state.cardCounts.get(5)?.count).toBe(8);
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(2);
  });

  it('競合していないデータ種別は競合の解決を待たずに同期される', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, { '1': 4 });
    const { port, seedCardCount, state } = createFakePort();
    seedCardCount(5, 8);
    await runSync(port, noConflict);
    expect(state.broachCounts.get(1)?.count).toBe(4);
    expect(loadBaselineRowSet<number>('shared_broach_counts').get('1')).toBe(4);
  });

  it('両方が同じ値に変わっていれば競合にせずベースラインだけ進める', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 8 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount } = createFakePort();
    seedCardCount(5, 8);
    const report = await runSync(port, noConflict);
    expect(report.unresolved).toEqual([]);
    expect(loadBaselineRowSet<number>('card_counts').get('5')).toBe(8);
  });
});

describe('runSync — 未解決の競合はカーソルを進めない', () => {
  it('未解決の競合は次回の同期でも再提示される', async () => {
    seedSyncedDevice();
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 9 });
    commitBaselineRow('card_counts', '5', 2);
    const { port, seedCardCount, seedRabbitNote, state } = createFakePort();
    seedCardCount(5, 8);                                          // 競合する行
    seedRabbitNote('七瀬陸', { shout: 1, beat: 2, melody: 3 });    // 適用される別種別の行

    const asked: string[][] = [];
    const recording: ConflictResolver = async (kinds) => {
      asked.push([...kinds]);
      return new Map();
    };

    await runSync(port, recording);
    const second = await runSync(port, recording);

    // 2 回目も競合として提示されること。カーソルが別種別の rev で前進すると
    // 競合していた行が pull に現れなくなり、黙ってローカルが勝つ
    expect(asked).toEqual([['card_counts'], ['card_counts']]);
    expect(second.unresolved).toEqual(['card_counts']);
    expect(state.cardCounts.get(5)?.count).toBe(8);
  });
});

describe('runSync — 部分失敗', () => {
  it('成功した行のベースラインだけを進める（失敗した行は次回再送される）', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2, '6': 3 });
    const { port } = createFakePort({ failPushKeys: new Set(['6']) });
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(report.failed).toBe(1);
    const baseline = loadBaselineRowSet<number>('card_counts');
    expect(baseline.get('5')).toBe(2);
    expect(baseline.has('6')).toBe(false);
  });

  it('失敗した行は次回の同期で再送される', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2, '6': 3 });
    const failing = new Set(['6']);
    const { port, state } = createFakePort({ failPushKeys: failing });
    await runSync(port, noConflict);
    failing.delete('6');
    const second = await runSync(port, noConflict);
    expect(second.pushed).toBe(1);
    expect(state.cardCounts.get(6)?.count).toBe(3);
  });
});

describe('runSync — デッキとラビットノートの push', () => {
  it('ローカルのデッキがサーバへ push される', async () => {
    saveJson(STORAGE_KEYS.SAVED_DECKS, [{
      id: 'd1', name: 'テストデッキ', createdAt: 1000, updatedAt: 2000,
      state: {
        songId: 42, deckIds: [101, null, null, null, null, null],
        bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [],
      },
    }]);
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.status).toBe('ok');
    expect(report.pushed).toBe(1);
    expect(state.decks.get('d1')?.name).toBe('テストデッキ');
    expect(state.decks.get('d1')?.deleted_at).toBeNull();
    expect(state.decks.get('d1')?.slots[0].card_id).toBe(101);
  });

  it('ローカルで削除したデッキは tombstone として push される（行を消さない）', async () => {
    seedSyncedDevice();
    // 前回同期済み: ベースラインにはデッキがあるが、ローカルからは消えている
    commitBaselineRow('decks', 'd1', {
      name: 'A', song_id: null,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null,
      slots: Array.from({ length: 6 }, (_, i) => ({
        slot_index: i, card_id: null, trained: false,
        skill_level: null, bonus_tier: null, shared_broach_ids: [],
      })),
    });
    saveJson(STORAGE_KEYS.SAVED_DECKS, []);
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    // 行が消えるのではなく deleted_at が立つこと。行の欠落で削除を表すと
    // 「まだ作っていない」と区別できなくなる
    expect(state.decks.has('d1')).toBe(true);
    expect(state.decks.get('d1')?.deleted_at).not.toBeNull();
  });

  it('ラビットノートがサーバへ push される', async () => {
    saveJson(STORAGE_KEYS.RABBIT_NOTES, { 七瀬陸: { shout: 1, beat: 2, melody: 3 } });
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(state.rabbitNotes.get('七瀬陸')).toMatchObject({ shout: 1, beat: 2, melody: 3 });
  });

  it('所持数を 0 に戻して消えた衣装は 0 として push される（行を消さない）', async () => {
    // cardCounts ストアの setCount は 0 のときキーを delete するため、
    // 「所持数を 0 に戻す」というこのサイトで最も日常的な操作がこの経路を通る
    seedSyncedDevice();
    commitBaselineRow('card_counts', '5', 2);
    saveJson(STORAGE_KEYS.CARD_COUNTS, {});
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(state.cardCounts.get(5)?.count).toBe(0);
  });

  it('ローカルで消したラビットノートは 0 として push される（行を消さない）', async () => {
    // RabbitNoteEditor には全消去ボタン (saveRabbitNotes({})) があり、
    // 0 のエントリを落として保存する経路もあるため、キーの消失は一級のユーザー操作
    seedSyncedDevice();
    commitBaselineRow('rabbit_notes', '七瀬陸', { shout: 1, beat: 2, melody: 3 });
    saveJson(STORAGE_KEYS.RABBIT_NOTES, {});
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(state.rabbitNotes.get('七瀬陸')).toMatchObject({ shout: 0, beat: 0, melody: 0 });
  });

  it('ローカルで消した所持数は 0 として push される（行を消さない）', async () => {
    seedSyncedDevice();
    commitBaselineRow('shared_broach_counts', '1', 4);
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, {});
    const { port, state } = createFakePort();
    const report = await runSync(port, noConflict);
    expect(report.pushed).toBe(1);
    expect(state.broachCounts.get(1)?.count).toBe(0);
  });
});

describe('runSync — 削除が収束すること', () => {
  it('所持衣装数の削除', async () => {
    seedSyncedDevice();
    commitBaselineRow('card_counts', '5', 2);
    saveJson(STORAGE_KEYS.CARD_COUNTS, {});
    const { port } = createFakePort();
    expect((await runSync(port, noConflict)).pushed).toBe(1);
    const second = await runSync(port, noConflict);
    const third = await runSync(port, noConflict);
    // 静止しないと push と adopt を永久に往復する（周期 2 の無限ループ）
    expect([second.pushed, second.adopted]).toEqual([0, 0]);
    expect([third.pushed, third.adopted]).toEqual([0, 0]);
  });

  it('共通ブローチ所持数の削除', async () => {
    seedSyncedDevice();
    commitBaselineRow('shared_broach_counts', '1', 4);
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, {});
    const { port } = createFakePort();
    expect((await runSync(port, noConflict)).pushed).toBe(1);
    const second = await runSync(port, noConflict);
    const third = await runSync(port, noConflict);
    expect([second.pushed, second.adopted]).toEqual([0, 0]);
    expect([third.pushed, third.adopted]).toEqual([0, 0]);
  });

  it('ラビットノートの削除', async () => {
    seedSyncedDevice();
    commitBaselineRow('rabbit_notes', '七瀬陸', { shout: 1, beat: 2, melody: 3 });
    saveJson(STORAGE_KEYS.RABBIT_NOTES, {});
    const { port } = createFakePort();
    expect((await runSync(port, noConflict)).pushed).toBe(1);
    const second = await runSync(port, noConflict);
    const third = await runSync(port, noConflict);
    expect([second.pushed, second.adopted]).toEqual([0, 0]);
    expect([third.pushed, third.adopted]).toEqual([0, 0]);
  });

  it('デッキの削除（tombstone が再スタンプされ続けない）', async () => {
    seedSyncedDevice();
    commitBaselineRow('decks', 'd1', {
      name: 'A', song_id: null,
      created_at: '2026-08-31T00:00:00.000Z', updated_at: '2026-08-31T00:00:00.000Z',
      deleted_at: null,
      slots: Array.from({ length: 6 }, (_, i) => ({
        slot_index: i, card_id: null, trained: false,
        skill_level: null, bonus_tier: null, shared_broach_ids: [],
      })),
    });
    saveJson(STORAGE_KEYS.SAVED_DECKS, []);
    const { port, state } = createFakePort();
    expect((await runSync(port, noConflict)).pushed).toBe(1);
    expect(state.decks.get('d1')?.deleted_at).not.toBeNull();
    // デッキだけは tombstone が 1 往復する。1 回目は push でベースラインが空になり、
    // 2 回目に tombstone を取り込んでベースラインへ入り、3 回目から静止する
    const second = await runSync(port, noConflict);
    expect([second.pushed, second.adopted]).toEqual([0, 1]);
    const third = await runSync(port, noConflict);
    const fourth = await runSync(port, noConflict);
    expect([third.pushed, third.adopted]).toEqual([0, 0]);
    expect([fourth.pushed, fourth.adopted]).toEqual([0, 0]);
  });

  it('サーバが返す時刻書式が違ってもデッキは再 push されない', async () => {
    // クライアントは 2026-08-31T00:00:00.000Z を送るが Postgres は
    // 2026-08-31T00:00:00+00:00 を返す。生文字列比較だと毎回再 push される
    saveJson(STORAGE_KEYS.SAVED_DECKS, [{
      id: 'd1', name: 'A', createdAt: 1_780_000_000_000, updatedAt: 1_780_000_000_000,
      state: {
        songId: null, deckIds: [1, null, null, null, null, null],
        bonusTiers: [], trained: [], sharedBroachs: [], skillLevels: [],
      },
    }]);
    const { port } = createFakePort();
    expect((await runSync(port, noConflict)).pushed).toBe(1);
    const second = await runSync(port, noConflict);
    const third = await runSync(port, noConflict);
    expect([second.pushed, second.adopted]).toEqual([0, 0]);
    expect([third.pushed, third.adopted]).toEqual([0, 0]);
  });
});

describe('runSync — ベースラインが書けないとき', () => {
  it('同期を止めて baseline-write-failed を返す（勝手なマージに倒さない）', async () => {
    saveJson(STORAGE_KEYS.CARD_COUNTS, { '5': 2 });
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function patched(key: string, value: string) {
      if (key === STORAGE_KEYS.SYNC_BASELINE) throw new Error('QuotaExceededError');
      return original.call(this, key, value);
    };
    try {
      const { port } = createFakePort();
      const report = await runSync(port, noConflict);
      expect(report.status).toBe('baseline-write-failed');
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
```

- [ ] **Step 3: テストが失敗することを確認する**

Run: `npx vitest run tests/unit/sync/syncEngine.test.ts`
Expected: FAIL（`Failed to resolve import`）

- [ ] **Step 4: `syncEngine.ts` を実装する**

```ts
import { ADAPTERS, findAdapter, planKind, type Adapter, type KindPlan } from './adapters';
import { commitBaselineRow, loadBaselineRowSet, type BaselineKind } from './baseline';
import type { PulledRows, SyncPort } from './port';
import type { RowSet } from './rows';
import { loadSyncMeta, nextCursorRev, reconcileUser, saveSyncMeta } from './syncMeta';

export type Resolution = 'local' | 'server';

export type ConflictResolver =
  (kinds: readonly BaselineKind[]) => Promise<Map<BaselineKind, Resolution>>;

export type SyncStatus = 'ok' | 'unauthenticated' | 'error' | 'baseline-write-failed';

export type SyncReport = {
  status: SyncStatus;
  adopted: number;
  pushed: number;
  failed: number;
  /** 競合が解決されず、今回触らなかったデータ種別 */
  unresolved: BaselineKind[];
  error?: string;
};

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type KindOutcome = { adopted: number; pushed: number; failed: number; baselineOk: boolean };

/**
 * 1 データ種別ぶんを適用する。
 *
 * 順序が重要: 先に取り込み（ローカルへ書く）→ そのぶんのベースラインを行単位で確定
 * → push → 成功した行だけベースラインを確定。ベースラインを一括更新してはならない。
 */
async function applyKind<V>(
  port: SyncPort,
  adapter: Adapter<V>,
  plan: KindPlan,
  resolution: Resolution | undefined,
): Promise<KindOutcome> {
  const outcome: KindOutcome = { adopted: 0, pushed: 0, failed: 0, baselineOk: true };
  const nextLocal: RowSet<V> = new Map(adapter.localRowSet());
  const baseline = loadBaselineRowSet<V>(adapter.kind);
  const pushEntries: [string, V | null][] = [];
  const adoptedKeys: [string, V | null][] = [];

  for (const verdict of plan.verdicts as unknown as {
    kind: 'noop' | 'push' | 'adopt' | 'conflict';
    key: string;
    value?: V | null;
    local?: V | null;
    server?: V | null;
  }[]) {
    if (verdict.kind === 'noop') {
      // 収束済みだがベースラインが古い行はここで進めておく。
      // 放置すると毎回 3 値比較の対象になり続ける
      const value = verdict.value ?? null;
      const known = baseline.has(verdict.key) ? (baseline.get(verdict.key) as V) : null;
      const differs = value === null || known === null
        ? value !== known
        : !adapter.equals(known, value);
      if (differs) adoptedKeys.push([verdict.key, value]);
      continue;
    }

    if (verdict.kind === 'adopt') {
      const value = verdict.value ?? null;
      if (value === null) nextLocal.delete(verdict.key);
      else nextLocal.set(verdict.key, value);
      adoptedKeys.push([verdict.key, value]);
      outcome.adopted += 1;
      continue;
    }

    if (verdict.kind === 'push') {
      pushEntries.push([verdict.key, verdict.value ?? null]);
      continue;
    }

    // conflict。resolution は呼び出し側で必ず決まっている
    if (resolution === 'server') {
      const value = verdict.server ?? null;
      if (value === null) nextLocal.delete(verdict.key);
      else nextLocal.set(verdict.key, value);
      adoptedKeys.push([verdict.key, value]);
      outcome.adopted += 1;
    } else {
      pushEntries.push([verdict.key, verdict.local ?? null]);
    }
  }

  // writeLocal はローカルの内容が実際に変わったときだけ呼ぶ。収束済みの noop 行
  // （ベースラインだけ古い行）で呼ぶと、何も変わらないのにストアの再読込が走る。
  // 失敗を無視してはならない: ベースラインだけ進むと、次の同期で古いローカルの値が
  // 相手の新しい値を上書きする
  if (outcome.adopted > 0 && !adapter.writeLocal(nextLocal)) {
    outcome.baselineOk = false;
    return outcome;
  }

  // ベースラインの確定は adopted の有無に関わらず行う。収束済みの noop 行は
  // ローカルを変えないが、ベースラインは進めないと毎回 3 値比較の対象になり続ける
  for (const [key, value] of adoptedKeys) {
    if (!commitBaselineRow(adapter.kind, key, value)) {
      outcome.baselineOk = false;
      return outcome;
    }
  }

  if (pushEntries.length > 0) {
    const results = await adapter.push(port, pushEntries);
    for (const [key, value] of pushEntries) {
      const result = results.get(key);
      if (result?.ok) {
        outcome.pushed += 1;
        if (!commitBaselineRow(adapter.kind, key, value)) {
          outcome.baselineOk = false;
          return outcome;
        }
      } else {
        // ベースラインを進めない。次回の diff が同じ差分を再検出して再送する
        outcome.failed += 1;
      }
    }
  }

  return outcome;
}

/**
 * 同期を 1 回実行する。
 *
 * この関数は SyncPort しか知らないため、実 Supabase なしで全分岐をテストできる。
 * どのエラー経路でも「何も書かずに状態だけ返す」のが既定の振る舞い。
 */
export async function runSync(
  port: SyncPort,
  resolveConflicts: ConflictResolver,
): Promise<SyncReport> {
  const report: SyncReport = { status: 'ok', adopted: 0, pushed: 0, failed: 0, unresolved: [] };

  let userId: string | null;
  try {
    userId = await port.getUserId();
  } catch (error) {
    return { ...report, status: 'error', error: describeError(error) };
  }
  if (userId === null) return { ...report, status: 'unauthenticated' };

  // reconcileUser は「ベースラインを捨ててから新しい userId を記録する」2 段の書き込み。
  // 前者だけ失敗すると別アカウントのベースラインを残したまま新しい userId を記録し、
  // 2 つのアカウントのデータが混ざる。null が返ったら同期そのものを中止する。
  const meta = reconcileUser(loadSyncMeta(), userId);
  if (meta === null) return { ...report, status: 'baseline-write-failed' };

  let pulled: PulledRows;
  try {
    pulled = await port.pull(meta.cursorRev);
  } catch (error) {
    return { ...report, status: 'error', error: describeError(error) };
  }

  // localStorage が壊れているとプロジェクションが throw しうる
  // （SAVED_DECKS が配列でない、createdAt が欠落しているなど。バックアップ復元後や
  // 旧形式のレコードで起こる）。どのエラー経路でも「何も書かずに状態だけ返す」
  let plans: KindPlan[];
  try {
    plans = ADAPTERS.map((adapter) => planKind(adapter, pulled));
  } catch (error) {
    return { ...report, status: 'error', error: describeError(error) };
  }

  const conflicted = plans.filter((plan) => plan.conflictKeys.length > 0).map((plan) => plan.kind);

  let resolutions = new Map<BaselineKind, Resolution>();
  if (conflicted.length > 0) {
    try {
      resolutions = await resolveConflicts(conflicted);
    } catch (error) {
      return { ...report, status: 'error', error: describeError(error) };
    }
  }

  const appliedRevs: number[] = [];

  for (const plan of plans) {
    const resolution = resolutions.get(plan.kind);
    if (plan.conflictKeys.length > 0 && resolution === undefined) {
      // 未解決の競合があるデータ種別は一切触らない（部分適用で状態を混ぜない）
      report.unresolved.push(plan.kind);
      continue;
    }

    let outcome: KindOutcome;
    try {
      outcome = await applyKind(port, findAdapter(plan.kind), plan, resolution);
    } catch (error) {
      return { ...report, status: 'error', error: describeError(error) };
    }

    report.adopted += outcome.adopted;
    report.pushed += outcome.pushed;
    report.failed += outcome.failed;
    if (!outcome.baselineOk) {
      return { ...report, status: 'baseline-write-failed' };
    }
    appliedRevs.push(...plan.serverRevs);
  }

  // 未解決の競合が 1 つでもあればカーソルを進めない。
  //
  // cursorRev はデータ種別を跨いだ単一の値なので、未解決の種別を飛ばしても
  // 他の種別の rev で前進してしまう。すると未解決だった行が次回の
  // pull(rev > cursor) に現れなくなり、「サーバ側は未変更」と解釈されて
  // ローカルが一方的に push される。つまり利用者が「あとで」を選んだ競合が
  // 二度と提示されないまま、別の端末の値を黙って上書きすることになる。
  const cursorRev = report.unresolved.length === 0
    ? nextCursorRev(meta.cursorRev, appliedRevs)
    : meta.cursorRev;

  saveSyncMeta({ userId, cursorRev, lastSyncedAt: Date.now() });

  return report;
}
```

- [ ] **Step 5: テストが通ることを確認する**

Run: `npx vitest run tests/unit/sync/syncEngine.test.ts`
Expected: PASS（28 tests）

- [ ] **Step 6: カバレッジを確認する**

Run: `npm run coverage`
Expected: `src/lib/**` のしきい値 95% を維持。不足していれば `src/lib/sync/` に対するテストを足す（到達不能な防御的分岐のみ `/* v8 ignore */` を使う）

- [ ] **Step 7: commit**

```bash
git add src/lib/sync/syncEngine.ts tests/unit/sync/fakePort.ts tests/unit/sync/syncEngine.test.ts
git commit -m "feat(sync): 同期のオーケストレーションを追加する (ADR 0064)"
```

---

### Task 13: `ModalDialog` に 3 択の `choose` を追加

**Files:**
- Modify: `src/components/ui/ModalDialog.svelte`

**Interfaces:**
- Consumes: なし
- Produces: `choose(options: ChooseOptions): Promise<'primary' | 'secondary' | null>`

既存の `confirm` / `prompt` は 2 択で、Esc とバックドロップが cancel に解決される。競合解決に流用すると「Esc を押しただけで別端末の内容に上書きされる」ため、**Esc / バックドロップ / 「あとで」がすべて「何もしない」に解決される 3 択**を加算的に足す。

- [ ] **Step 1: 型と定数を追加する**

`ConfirmOptions` / `PromptOptions` の宣言のあとに追加する:

```ts
  type ChooseOptions = {
    title: string;
    message?: string;
    /** 主となる選択（例: この端末の内容を使う） */
    primaryLabel: string;
    /** 対になる選択（例: 別の端末の内容を使う） */
    secondaryLabel: string;
    /** 何もしないで閉じる選択。既定は「あとで」 */
    dismissLabel?: string;
  };

  /** choose の戻り値。null は「何もしない」 */
  type ChooseResult = 'primary' | 'secondary' | null;
```

- [ ] **Step 2: 内部状態を `choose` に対応させる**

```ts
  let mode = $state<'confirm' | 'prompt' | 'choose'>('confirm');
  let opts = $state<PromptOptions & Partial<ChooseOptions>>({ title: '' });
```

`resolve` の型を広げる:

```ts
  type DialogResult = boolean | string | ChooseResult;
  let resolve: ((value: DialogResult) => void) | null = null;
```

`settle` / `show` のシグネチャも `DialogResult` / `'confirm' | 'prompt' | 'choose'` に合わせる。

- [ ] **Step 3: `cancelPending` と `onCancel` を `choose` 対応にする**

どちらも「confirm は false / それ以外は null」で正しく動くため、条件を変えるのは不要。念のためコメントを添える:

```ts
  function cancelPending() {
    const pending = resolve;
    resolve = null;
    // choose は null が「何もしない」なので prompt と同じ扱いでよい
    pending?.(mode === 'confirm' ? false : null);
  }
```

- [ ] **Step 4: `choose` を export する**

`prompt` の宣言のあとに追加する:

```ts
  /**
   * 3 択のダイアログ。競合の解決に使う。
   *
   * Esc / バックドロップ / dismiss ボタンはすべて null に解決され、何も起きない。
   * どちらの選択肢もデータを失わせるため、安全な逃げ道を必ず用意する必要がある。
   */
  export function choose(options: ChooseOptions): Promise<ChooseResult> {
    cancelPending();
    return new Promise<ChooseResult>((res) => {
      resolve = res as (value: DialogResult) => void;
      void show('choose', options as PromptOptions & ChooseOptions);
    });
  }
```

- [ ] **Step 5: 初期フォーカスを「あとで」に置く**

`show` のフォーカス分岐に `choose` を足す。どちらの選択肢も不可逆なので、Enter 連打で誤確定しないよう逃げ道へ置く:

```ts
    if (nextMode === 'prompt') {
      inputEl?.focus();
      inputEl?.select();
    } else if (nextMode === 'choose' || nextOpts.danger) {
      // choose はどちらの選択肢もデータを失わせるため、まず「あとで」へ置く
      cancelEl?.focus();
    } else {
      confirmEl?.focus();
    }
```

- [ ] **Step 6: ボタンを描画する**

`{#if mode === 'prompt'}` の入力欄ブロックのあと、ボタン列を `choose` で分岐させる:

```svelte
      <div class="mt-5 flex flex-wrap justify-end gap-2">
        {#if mode === 'choose'}
          <button
            bind:this={cancelEl}
            type="button"
            class="rounded-control bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 pressable"
            onclick={onCancel}
          >
            {opts.dismissLabel ?? 'あとで'}
          </button>
          <button
            type="button"
            class="rounded-control border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 pressable"
            onclick={() => settle('secondary')}
          >
            {opts.secondaryLabel}
          </button>
          <button
            bind:this={confirmEl}
            type="button"
            class="rounded-control bg-chrome-ink px-4 py-2 text-sm font-bold text-white hover:bg-chrome-ink-soft pressable"
            onclick={() => settle('primary')}
          >
            {opts.primaryLabel}
          </button>
        {:else}
          {#if showCancel}
            <button
              bind:this={cancelEl}
              type="button"
              class="rounded-control bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 pressable"
              onclick={onCancel}
            >
              {cancelLabel}
            </button>
          {/if}
          <button
            bind:this={confirmEl}
            type="button"
            class="rounded-control px-4 py-2 text-sm font-bold text-white pressable {opts.danger
              ? 'bg-red-600 hover:bg-red-700'
              : 'bg-chrome-ink hover:bg-chrome-ink-soft'}"
            onclick={onConfirm}
          >
            {confirmLabel}
          </button>
        {/if}
      </div>
```

配色は無彩色のみ（ADR 0047）。`indigo` を使ってはならない。

- [ ] **Step 7: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint`
Expected: どちらもエラーなし

- [ ] **Step 8: 既存ダイアログの非回帰を確認する**

```bash
npm run dev            # 約 1 秒で起動
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/    # 200 を確認
npx playwright test tests/score-calc-persistence.test.ts tests/max-score-finder.test.ts
```

Expected: PASS（`ModalDialog` の `confirm` / `prompt` を使う既存フローが壊れていないこと）

- [ ] **Step 9: commit**

```bash
git add src/components/ui/ModalDialog.svelte
git commit -m "feat(ui): ModalDialog に 3 択の choose を追加する (ADR 0064)"
```

---

### Task 14: フッターの同期 UI

**Files:**
- Create: `src/components/SyncPanel.svelte`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/components/DeckList.svelte`（`i7:sync-applied` を購読して読み直す）
- Modify: `src/components/RabbitNoteEditor.svelte`（同上）
- Test: `tests/sync-panel.test.ts`

**Interfaces:**
- Consumes: `getSupabaseClient` (Task 1)、`createSupabasePort` (Task 10)、`runSync` (Task 12)、`ModalDialog.choose` (Task 13)
- Produces: フッターの同期 UI。`i7:backup-imported` イベントの購読者

- [ ] **Step 1: `SyncPanel.svelte` を作る**

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import InlineAlert from './ui/InlineAlert.svelte';
  import ModalDialog from './ui/ModalDialog.svelte';
  import { STORAGE_KEYS, onSave } from '../lib/storage';
  import type { BaselineKind } from '../lib/sync/baseline';
  import { hasPendingLocalChanges } from '../lib/sync/adapters';
  import { createSupabasePort } from '../lib/sync/supabasePort';
  import { getSupabaseClient } from '../lib/sync/supabaseClient';
  import { runSync, type ConflictResolver, type Resolution } from '../lib/sync/syncEngine';
  import { loadSyncMeta, resetSyncState } from '../lib/sync/syncMeta';

  /** この 4 キーの変更だけが同期のトリガーになる */
  const SYNC_TARGET_KEYS = new Set<string>([
    STORAGE_KEYS.CARD_COUNTS,
    STORAGE_KEYS.SHARED_BROACH_COUNTS,
    STORAGE_KEYS.RABBIT_NOTES,
    STORAGE_KEYS.SAVED_DECKS,
  ]);

  /** ユーザー可視テキストは「衣装」「共通ブローチ」を使う (用語ポリシー) */
  const KIND_LABELS: Record<BaselineKind, string> = {
    card_counts: '所持衣装数',
    shared_broach_counts: '共通ブローチの所持数',
    rabbit_notes: 'ラビットノート',
    decks: '保存デッキ',
  };

  /** 所持数の連続増減で毎回リクエストが飛ぶのを防ぐ */
  const DEBOUNCE_MS = 3000;

  const client = getSupabaseClient();
  const port = client ? createSupabasePort(client) : null;

  let dialog: ModalDialog | undefined;
  let phase = $state<'anonymous' | 'authenticating' | 'idle' | 'syncing'>('anonymous');
  let error = $state<string | null>(null);
  let lastSyncedAt = $state<number | null>(null);
  let pendingChanges = $state(false);
  /** 利用者が「あとで」を選んだ競合が残っているか。立っている間は自動再同期しない */
  let unresolved = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight = false;

  const statusText = $derived.by(() => {
    if (phase === 'authenticating') return 'ログイン中…';
    if (phase === 'syncing') return '同期中…';
    if (phase === 'anonymous') return null;
    if (unresolved) return '未解決の競合があります';
    if (pendingChanges) return '未同期の変更あり';
    if (lastSyncedAt === null) return '同期待ち';
    return `同期済み · ${relativeTime(lastSyncedAt)}`;
  });

  function relativeTime(at: number): string {
    const minutes = Math.floor((Date.now() - at) / 60_000);
    if (minutes < 1) return 'たった今';
    if (minutes < 60) return `${minutes} 分前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} 時間前`;
    return `${Math.floor(hours / 24)} 日前`;
  }

  const resolveConflicts: ConflictResolver = async (kinds) => {
    const out = new Map<BaselineKind, Resolution>();
    for (const kind of kinds) {
      const answer = await dialog?.choose({
        title: `${KIND_LABELS[kind]}が両方の端末で変更されています`,
        message: 'どちらの内容を残しますか。選ばなかった側は失われます。',
        primaryLabel: 'この端末の内容を使う',
        secondaryLabel: '別の端末の内容を使う',
      });
      if (answer === 'primary') out.set(kind, 'local');
      else if (answer === 'secondary') out.set(kind, 'server');
      // null は「あとで」。この種別は今回触らず、次回の同期で再度聞かれる
    }
    return out;
  };

  async function sync() {
    if (!port || inFlight || phase === 'anonymous') return;
    inFlight = true;
    phase = 'syncing';
    error = null;
    try {
      const report = await runSync(port, resolveConflicts);
      if (report.status === 'ok') {
        lastSyncedAt = loadSyncMeta().lastSyncedAt;
        unresolved = report.unresolved.length > 0;
        pendingChanges = unresolved;
      } else if (report.status === 'unauthenticated') {
        phase = 'anonymous';
      } else if (report.status === 'baseline-write-failed') {
        error = 'この端末の保存領域が不足しているため同期を停止しました';
      } else {
        error = '同期できませんでした';
      }
    } catch {
      error = '同期できませんでした';
    } finally {
      inFlight = false;
      if (phase === 'syncing') phase = 'idle';
      // デバウンス待ち中に走っていたら、完了後にもう一度評価する。
      // ただし未解決の競合があるときは再スケジュールしない。競合が未解決だと
      // pendingChanges が立ったままなので、そのまま再同期すると同じ確認ダイアログが
      // 3 秒ごとに出続け、「あとで」という安全な逃げ道が逃げ道でなくなる。
      // 再度聞くのは、利用者が何か保存したときか「今すぐ同期」を押したときだけ
      if (pendingChanges && error === null && !unresolved) scheduleSync();
    }
  }

  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(() => void sync(), DEBOUNCE_MS);
  }

  function flush() {
    clearTimeout(timer);
    void sync();
  }

  async function signIn() {
    if (!client) return;
    phase = 'authenticating';
    error = null;
    const { error: authError } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (authError) {
      phase = 'anonymous';
      error = 'ログインを開始できませんでした';
    }
  }

  async function signOut() {
    if (!client) return;
    clearTimeout(timer);
    await client.auth.signOut();
    phase = 'anonymous';
    lastSyncedAt = null;
    pendingChanges = false;
    unresolved = false;
    // 直前の失敗表示を残したままログイン導線に戻さない
    error = null;
  }

  async function deleteServerData() {
    if (!port) return;
    const ok = await dialog?.confirm({
      title: 'サーバのデータを削除しますか',
      message: 'この端末のデータは残ります。サーバに保存された同期データを削除し、ログアウトします。',
      confirmLabel: '削除してログアウト',
      danger: true,
    });
    if (!ok) return;
    // signOut を try の外に出す。中に入れると、削除は成功したのに signOut が失敗した場合に
    // 「削除できませんでした」と誤った報告をしてしまう
    try {
      await port.deleteAll();
    } catch {
      error = '削除できませんでした';
      return;
    }
    resetSyncState();
    // 削除後もログイン状態のままだと、次の同期でローカルのデータが
    // そのまま再アップロードされ「削除したのに戻ってくる」ことになる
    await signOut();
  }

  onMount(() => {
    if (!client) return;

    // 保存イベントだけに頼ると、オフラインで変更したあとリロードした場合に
    // 未同期であることが表示されないため、mount 時にベースラインとの差分を見る
    pendingChanges = hasPendingLocalChanges();

    const { data } = client.auth.onAuthStateChange((_event, session) => {
      phase = session ? 'idle' : 'anonymous';
      if (session) void sync();
    });

    const unsubscribeSave = onSave((key) => {
      if (!SYNC_TARGET_KEYS.has(key)) return;
      pendingChanges = true;
      // 利用者が何か保存したなら、競合をもう一度聞いてよい
      unresolved = false;
      if (phase !== 'anonymous') scheduleSync();
    });

    // 別タブでの変更。同一タブでは storage イベントが飛ばないので onSave と役割が分かれる
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && SYNC_TARGET_KEYS.has(event.key)) {
        pendingChanges = true;
        if (phase !== 'anonymous') scheduleSync();
      }
    };

    // バックアップ復元でローカルが外部から書き換わった。ベースラインが実態と合わないため捨てる。
    // ここで flush() しないこと: FooterTools はこのイベントの 800ms 後に location.reload() する。
    // 即時同期を始めると初回リンクの確認ダイアログを出した直後に reload で破棄されうる。
    // 同期は reload 後の mount に任せる（そこで hasPendingLocalChanges が true になる）。
    const onBackupImported = () => {
      resetSyncState();
      lastSyncedAt = null;
      pendingChanges = true;
    };

    // beforeunload は発火が不安定なので visibilitychange を使う
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && pendingChanges) flush();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('i7:backup-imported', onBackupImported);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      data.subscription.unsubscribe();
      unsubscribeSave();
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('i7:backup-imported', onBackupImported);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

{#if client}
  <span class="flex items-center gap-3" data-testid="sync-panel">
    {#if phase === 'anonymous'}
      <button
        type="button"
        class="hover:text-gray-600 hover:underline underline-offset-2"
        onclick={signIn}
      >
        ログイン（端末間で同期）
      </button>
    {:else}
      <span aria-live="polite" data-testid="sync-status">{statusText}</span>
      {#if pendingChanges && phase === 'idle'}
        <button type="button" class="hover:text-gray-600 hover:underline underline-offset-2" onclick={flush}>
          今すぐ同期
        </button>
      {/if}
      <button type="button" class="hover:text-gray-600 hover:underline underline-offset-2" onclick={signOut}>
        ログアウト
      </button>
      <button type="button" class="hover:text-gray-600 hover:underline underline-offset-2" onclick={deleteServerData}>
        サーバのデータを削除
      </button>
    {/if}
    <InlineAlert message={error} tone="error" />
  </span>

  <ModalDialog bind:this={dialog} />
{/if}
```

環境変数が未設定なら `client` が `null` になり **何も描画されない**（現在と完全に同一のフッターになる）。

### 5.1.1 取り込み後に画面を更新する

所持衣装数と共通ブローチはアダプタの `writeLocal` がストアの `reloadFromStorage` /
`reloadBroachCountsFromStorage` を呼ぶのでリアクティブに反映される。しかし **デッキ一覧と
ラビットノートには対応するストアが無く**、`DeckList.svelte` と `RabbitNoteEditor.svelte` は
mount 時の `$effect` でローカル変数にキャッシュしている。外部からの localStorage 書き込みには
反応しないため、サーバから取り込んだ直後にその画面を開いていると **古い値を表示し続ける**。

`sync()` が `report.adopted > 0` で終わったとき、`SyncPanel` から次を発火する:

```ts
      if (report.adopted > 0) window.dispatchEvent(new CustomEvent('i7:sync-applied'));
```

購読側は 2 コンポーネントに数行ずつ足す。`DeckList.svelte`:

```svelte
  onMount(() => {
    // 同期でサーバの内容を取り込んだら読み直す。同期層が無ければ発火しないので、
    // このリスナは同期層への依存にはならない（イベント名の文字列しか知らない）。
    const reload = () => { decks = loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, []); };
    window.addEventListener('i7:sync-applied', reload);
    return () => window.removeEventListener('i7:sync-applied', reload);
  });
```

`RabbitNoteEditor.svelte` も同じ形だが、**未保存の編集を消さない条件を必ず付ける**。
この画面の `data` は入力のたびに書き換わるメモリ上のバッファで、永続化されるのは
「保存」ボタンを押したときだけ。無条件に読み直すと、利用者が入力途中の値を
背後の同期が黙って消してしまう。

```svelte
  let dirty = $state(false);

  function setValue(member: string, attr: 'shout' | 'beat' | 'melody', val: number) {
    const entry = data[member] ?? { shout: 0, beat: 0, melody: 0 };
    data[member] = { ...entry, [attr]: val };
    dirty = true;
  }

  onMount(() => {
    const onSyncApplied = () => {
      if (dirty) {
        // 未保存の編集を背後の同期で黙って消さない。代わりに知らせる
        showFeedback('別の端末の変更があります。保存すると上書きされます');
        return;
      }
      data = loadRabbitNotes();
    };
    window.addEventListener('i7:sync-applied', onSyncApplied);
    return () => window.removeEventListener('i7:sync-applied', onSyncApplied);
  });
```

`onSave` と `onClear` は保存後に `dirty = false` に戻すこと。

`DeckList.svelte` にはこの配慮は不要。デッキは操作のたびに `writeDecks` が即座に
永続化するため、未保存のバッファが存在しない。

**ページ全体の reload では解決しない。** 利用者が編集中の画面を勝手に再読込するのは
破壊的で、`FooterTools` のインポート後 reload（明示的な操作の直後）とは事情が違う。

- [ ] **Step 2: `BaseLayout.astro` に島を追加する**

`src/layouts/BaseLayout.astro` の import 行に追加:

```astro
import SyncPanel from '../components/SyncPanel.svelte';
```

フッターの `FooterTools` の隣に置く（184 行目付近）:

```astro
      <div class="text-xs text-gray-400 py-3 px-4 flex flex-wrap items-center justify-center gap-3">
        <a href={`${base}releases/`} class="hover:text-gray-600 hover:underline underline-offset-2">{version}</a>
        <FooterTools client:load />
        <SyncPanel client:load />
      </div>
```

- [ ] **Step 3: E2E テストを書く**

`tests/sync-panel.test.ts`:

```ts
import { test, expect } from './helpers/fixtures';

/** Supabase への通信を全遮断する（オフライン相当） */
async function blockSupabase(page: import('@playwright/test').Page) {
  await page.route('**/*.supabase.co/**', (route) => route.abort());
}

test('未ログイン時はログインの導線だけを出す', async ({ page }) => {
  await page.goto('/');
  const panel = page.getByTestId('sync-panel');
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('button', { name: 'ログイン（端末間で同期）' })).toBeVisible();
  await expect(panel.getByTestId('sync-status')).toHaveCount(0);
});

test('同期 UI を足してもフッターのバックアップ UI は動く', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'エクスポート' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'インポート' })).toBeVisible();
});

test('Supabase を全遮断しても所持衣装の登録が動く', async ({ page }) => {
  await blockSupabase(page);
  await page.goto('/mycard/');
  // 所持数を 1 件登録し、リロード後も残ることを確認する
  const plus = page.getByRole('button', { name: '+' }).first();
  await plus.click();
  await page.reload();
  const counts = await page.evaluate(() => localStorage.getItem('i7_card_counts'));
  expect(counts).not.toBeNull();
  expect(Object.keys(JSON.parse(counts ?? '{}')).length).toBeGreaterThan(0);
});

test('Supabase を全遮断してもスコア計算ページが開ける', async ({ page }) => {
  await blockSupabase(page);
  await page.goto('/score-calc/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
});
```

> `test` / `expect` は `./helpers/fixtures` から import する（ADR 0055）。`@playwright/test` から直接 import してはならない。

- [ ] **Step 4: E2E を走らせる**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/    # 200 を確認
npx playwright test tests/sync-panel.test.ts
```

Expected: PASS（4 tests）。`/mycard/` のボタン名が実際と違う場合は、まず `npx playwright test tests/mycard.test.ts` の既存ロケータに合わせること

- [ ] **Step 5: 画面を確認してスクリーンショットを撮る**

dev サーバー（`http://localhost:4321/`）にアクセスし、フッターの表示を確認する。`tmp/sync-panel-footer.png` に保存してユーザーに提示する。

- [ ] **Step 6: 型チェックと lint を通す**

Run: `npm run typecheck && npm run lint && npx vitest run`
Expected: すべてエラーなし

- [ ] **Step 7: dev サーバーを止めて commit**

```bash
astro dev stop
git add src/components/SyncPanel.svelte src/layouts/BaseLayout.astro tests/sync-panel.test.ts
git commit -m "feat(sync): フッターに同期 UI を追加する (ADR 0064)"
```

---

### Task 15: プライバシーポリシーページ

**Files:**
- Create: `src/pages/privacy/index.astro`
- Modify: `src/lib/seo.ts`
- Test: `tests/privacy.test.ts`

**Interfaces:**
- Consumes: `BaseLayout` / `PAGE_DESCRIPTIONS`
- Produces: `/privacy/`（index 対象）

`astro.config.mjs` の sitemap `filter` は衣装詳細・イベント共有・個人データページのみを除外しているため、`/privacy/` は既定で sitemap に含まれる。**設定変更は不要。**

- [ ] **Step 1: `PAGE_DESCRIPTIONS` に追記する**

`src/lib/seo.ts` の `PAGE_DESCRIPTIONS` に追加:

```ts
  privacy: '非公式ファンツール「i7マネ部屋」のプライバシーポリシー。端末間同期で取得する情報・保存されるデータ・保存先・削除方法を説明します。',
```

- [ ] **Step 2: ページを作る**

`src/pages/privacy/index.astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import { PAGE_DESCRIPTIONS } from '../../lib/seo.ts';

const base = import.meta.env.BASE_URL;
const breadcrumbs = [
  { name: 'ホーム', url: base },
  { name: 'プライバシーポリシー', url: `${base}privacy/` },
];
---

<BaseLayout title="プライバシーポリシー" description={PAGE_DESCRIPTIONS.privacy} breadcrumbs={breadcrumbs}>
  <h1 class="text-2xl font-bold text-display mb-2">プライバシーポリシー</h1>
  <p class="text-sm text-gray-600 mb-8">
    当サイト「i7マネ部屋(β)」における個人情報の取り扱いについて説明します。
  </p>

  <section class="surface-card p-6 mb-6">
    <h2 class="text-lg font-bold text-display text-gray-900 mb-3">ログインしない場合</h2>
    <p class="text-sm text-gray-700">
      所持衣装・保存デッキ・ラビットノート・共通ブローチなどの入力内容は、すべてご利用の端末のブラウザ内（localStorage）にのみ保存されます。当サイトのサーバへ送信されることはなく、当サイトが個人情報を取得することもありません。
    </p>
  </section>

  <section class="surface-card p-6 mb-6">
    <h2 class="text-lg font-bold text-display text-gray-900 mb-3">端末間同期を使う場合</h2>
    <h3 class="text-sm font-bold text-gray-900 mt-4 mb-1">取得する情報</h3>
    <p class="text-sm text-gray-700">
      Google アカウントでログインした場合、認証基盤から <strong>メールアドレス</strong> と <strong>アカウント識別子</strong> を取得します。パスワードを取得することはありません。
    </p>
    <h3 class="text-sm font-bold text-gray-900 mt-4 mb-1">保存されるデータ</h3>
    <ul class="list-disc pl-5 space-y-1 text-sm text-gray-700">
      <li>所持衣装数</li>
      <li>共通ブローチの所持数</li>
      <li>ラビットノート</li>
      <li>保存デッキ（編成内容・デッキ名）</li>
    </ul>
    <p class="text-sm text-gray-700 mt-2">
      スコア計算やポイント芸計算の入力途中の状態、画面の表示設定は同期の対象外で、端末内にのみ保存されます。
    </p>
    <h3 class="text-sm font-bold text-gray-900 mt-4 mb-1">保存先</h3>
    <p class="text-sm text-gray-700">
      Supabase Inc. が提供するデータベースサービス上の、東京リージョン（ap-northeast-1）に保存されます。
    </p>
    <h3 class="text-sm font-bold text-gray-900 mt-4 mb-1">利用目的</h3>
    <p class="text-sm text-gray-700">
      複数の端末で同じデータを利用できるようにするためにのみ使用します。広告配信・行動分析・第三者への提供は行いません。
    </p>
  </section>

  <section class="surface-card p-6 mb-6">
    <h2 class="text-lg font-bold text-display text-gray-900 mb-3">データの削除</h2>
    <p class="text-sm text-gray-700">
      ページ下部のフッターにある「サーバのデータを削除」から、保存された同期データをいつでも全件削除できます。端末内のデータは削除されません。
    </p>
    <p class="text-sm text-gray-700 mt-2">
      アカウント自体（メールアドレスとアカウント識別子）の削除をご希望の場合は、下記の窓口までご連絡ください。技術的な制約により、この操作のみ手動で対応しています。
    </p>
  </section>

  <section class="surface-card p-6 mb-6">
    <h2 class="text-lg font-bold text-display text-gray-900 mb-3">お問い合わせ</h2>
    <p class="text-sm text-gray-700">
      当サイトについてのお問い合わせは
      <a href={`${base}about/`} class="text-gray-900 underline underline-offset-2 hover:text-gray-600">このサイトについて</a>
      に記載の窓口までお願いします。
    </p>
  </section>
</BaseLayout>
```

> **`/about/` に連絡窓口の記載が無い場合は、このタスク内で `/about/` に窓口を追記すること。** 記載のない窓口へ誘導してはならない。

- [ ] **Step 3: E2E テストを書く**

`tests/privacy.test.ts`:

```ts
import { test, expect } from './helpers/fixtures';

test('プライバシーポリシーが表示され index 対象になっている', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByRole('heading', { level: 1, name: 'プライバシーポリシー' })).toBeVisible();
  // 法的ページは検索から到達できる必要があるため noindex にしない (ADR 0057)
  await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(0);
});

test('同期で保存されるデータと削除方法が書かれている', async ({ page }) => {
  await page.goto('/privacy/');
  await expect(page.getByText('所持衣装数')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'データの削除' })).toBeVisible();
  await expect(page.getByText('サーバのデータを削除')).toBeVisible();
});
```

- [ ] **Step 4: E2E を走らせる**

```bash
npm run dev
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4321/privacy/    # 200 を確認
npx playwright test tests/privacy.test.ts
```

Expected: PASS（2 tests）

- [ ] **Step 5: 用語ポリシーの確認**

Run: `grep -n 'カード' src/pages/privacy/index.astro`
Expected: 一致なし（ユーザー可視テキストでは「衣装」を使う）

- [ ] **Step 6: commit**

```bash
astro dev stop
git add src/pages/privacy/index.astro src/lib/seo.ts tests/privacy.test.ts
git commit -m "docs(privacy): プライバシーポリシーページを追加する (ADR 0064)"
```

---

### Task 16: Supabase の自動停止を防ぐ週次 cron

無料枠は 7 日間 API リクエストが無いとプロジェクトが自動停止し、手動再開が必要になる。利用者ゼロの期間にこれを踏むため予防する。

**Files:**
- Create: `.github/workflows/keep-supabase-awake.yml`

**Interfaces:**
- Consumes: Actions Variables の `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- Produces: なし

- [ ] **Step 1: workflow を作る**

```yaml
name: Keep Supabase awake

# 無料枠は 7 日間 API リクエストが無いとプロジェクトが自動停止する (ADR 0064)。
# 利用者ゼロの期間に停止するのを防ぐため、週 1 回だけ軽いリクエストを送る。
# publishable key しか使わないため CI に秘密情報は増えない。
on:
  schedule:
    - cron: '17 3 * * 1'
  workflow_dispatch:

permissions:
  contents: read

jobs:
  ping:
    runs-on: ubuntu-latest
    steps:
      - name: Ping Supabase auth settings
        env:
          SUPABASE_URL: ${{ vars.PUBLIC_SUPABASE_URL }}
          SUPABASE_KEY: ${{ vars.PUBLIC_SUPABASE_PUBLISHABLE_KEY }}
        shell: bash
        run: |
          if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_KEY" ]; then
            echo "Supabase の Variables が未設定のためスキップします"
            exit 0
          fi
          # /auth/v1/settings は publishable key で叩ける軽量なエンドポイント。
          # /rest/v1/ のルートは secret key 専用なので使えない。
          STATUS=$(curl -s -o /dev/null -w '%{http_code}' \
            -H "apikey: $SUPABASE_KEY" \
            "$SUPABASE_URL/auth/v1/settings")
          echo "HTTP $STATUS"
          if [ "$STATUS" != "200" ]; then
            echo "::error::Supabase が想定外の応答を返しました (HTTP $STATUS)"
            exit 1
          fi
```

- [ ] **Step 2: 手動実行して疎通を確認する**

```bash
git add .github/workflows/keep-supabase-awake.yml
git commit -m "ci: Supabase の自動停止を防ぐ週次 cron を追加する (ADR 0064)"
git push
gh workflow run keep-supabase-awake.yml --ref feat/supabase-deck-sync
sleep 30 && gh run list --workflow=keep-supabase-awake.yml --limit 1
```

Expected: `HTTP 200` でジョブが成功する

---

### Task 17: `CLAUDE.md` の追記と最終検証

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: なし
- Produces: なし

- [ ] **Step 1: 設計原則に例外を追記する**

`CLAUDE.md` の「設計原則: 完全静的サイト」の箇条書きの末尾に追加する:

```markdown
- **例外（ADR 0064）**: 端末間同期のみ Supabase（Postgres + Auth + PostgREST）に依存する。ただし次の不変条件を満たすこと。**同期は純粋な付加機能であり、Supabase が落ちていても、環境変数が未設定でも、未ログインでも、全機能が localStorage のみで従来通り動作しなければならない。** 同期層（`src/lib/sync/` と `src/components/SyncPanel.svelte`）を丸ごと削除しても既存機能が無傷であること。既存コードが同期層を import してはならない（依存は同期層 → 既存の一方向のみ）
```

- [ ] **Step 2: User Data Backup の節に除外キーを追記する**

`STORAGE_KEYS` の表に 2 行足し、その下に注記を追加する:

```markdown
| `i7_sync_meta` | 同期メタ情報（**バックアップ対象外**） |
| `i7_sync_baseline` | 同期のベースライン（**バックアップ対象外**） |
```

```markdown
`i7_sync_meta` / `i7_sync_baseline` は `BACKUP_EXCLUDED_KEYS`（`src/lib/storage.ts`）でエクスポート対象から除外している。「この端末がどこまでサーバと一致しているか」を表す端末固有の状態であり、別端末のものを取り込むと同期エンジンが「同期済み」と誤認して未同期の変更を取りこぼすため（ADR 0064 決定 10）。**これが「新しいキーは必ず `STORAGE_KEYS` に追記する」ルールの唯一の例外**であり、新しいキーを足すときは原則どおりバックアップ対象に含めること。
```

- [ ] **Step 3: 同期とスキーマの運用を新しい節として追記する**

`### Deployment` の直前に追加する:

```markdown
### 端末間同期 / Supabase（ADR 0064）

- **Drizzle はスキーマ・RLS ポリシー・migration 生成の単一情報源。実行時クエリには使わない。** ブラウザから Postgres へ直接接続すると DB 資格情報の埋め込みが必要で RLS も効かないため、実行時は supabase-js（PostgREST）を通す。`src/` からは `import type` のみで参照し、クライアントバンドルには含めない
- スキーマは `db/schema.ts`、migration は `drizzle/`（commit 済み）
- **migration の適用は手動** (`npx drizzle-kit migrate`)。`DATABASE_URL` はローカルの `.env` のみに置き、CI には渡さない。毎時 cron が `main` にマージする構成で DB スキーマを破壊しうる権限を CI に置かないため
- `drizzle.config.ts` の `schemaFilter: ['public']` を外してはならない。Supabase 管理下の `auth` スキーマが管理対象になり、migration に破壊的変更が混入する
- **`timestamp` は必ず `mode: 'string'`**。既定モードでは `InferSelectModel` が `Date` を返すが、PostgREST が返すのは ISO 文字列で型と実際の値が食い違う
- TS のプロパティ名は列名と一致させ snake_case にする（`casing: 'snake_case'` は使わない）
- 環境変数 `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY` は公開前提の値なので GitHub Actions では Secrets ではなく **Variables** に置く。未設定のビルドは失敗させず同期 UI を非表示にすること（Dependabot の PR は Variables を参照できない）
- **ベースラインの更新は行単位に限る。** `commitBaselineRow` 以外の更新経路を作らないこと。部分失敗時の再送がこの粒度に依存している
```

- [ ] **Step 4: 全体を検証する**

```bash
npm run typecheck
npm run lint
npm run test:unit
npm run coverage
```

Expected: すべて成功。カバレッジは `src/lib/**` で 95% 以上

- [ ] **Step 5: 本番ビルドで検証する**

環境変数の埋め込み・動的ルート全件生成・圧縮後の挙動は本番ビルドでしか確認できない。

```bash
npm run preview    # build 込み。5.5 分以上かかるので timeout は 420000 ms 以上を確保する
```

Expected: ビルド成功。`http://localhost:4321/` と `http://localhost:4321/privacy/` が 200

- [ ] **Step 6: 環境変数なしでもビルドが通ることを確認する（重要）**

Dependabot の PR ではこの経路になる。

```bash
env -u PUBLIC_SUPABASE_URL -u PUBLIC_SUPABASE_PUBLISHABLE_KEY npx astro build
```

Expected: ビルド成功。生成された HTML に同期 UI が含まれないこと:

```bash
grep -c 'sync-panel' dist/index.html    # 0 であること
```

- [ ] **Step 7: E2E を通す**

```bash
npx playwright test
```

Expected: 全件 PASS（既存テストの非回帰を含む）

- [ ] **Step 8: commit して PR を作る**

```bash
git add CLAUDE.md
git commit -m "docs: 端末間同期と Supabase の運用を CLAUDE.md に追記する (ADR 0064)"
git push
gh pr create --base develop --title "feat(sync): 端末間同期を実装する (ADR 0064)" --body "$(cat <<'BODY'
## 概要

[ADR 0064](../blob/develop/docs/adr/0064-supabase-server-sync.md) の設計に沿って、Google ログインによる端末間同期を実装する。対象は所持衣装数 / 共通ブローチ所持数 / ラビットノート / 保存デッキ。

## 不変条件

同期は純粋な付加機能であり、Supabase が落ちていても、環境変数が未設定でも、未ログインでも、全機能が localStorage のみで従来通り動作する。既存の 13 箇所の `saveJson` 呼び出しは変更していない（`storage.ts` のフック 1 箇所で変更を捕捉している）。

## 実装

- `db/schema.ts` — Drizzle スキーマ。テーブルと RLS ポリシーの単一情報源。実行時クエリには使わない
- `drizzle/` — 生成された migration。**適用は手動**（`DATABASE_URL` は CI に渡さない）
- `src/lib/sync/` — プロジェクション / 2-way 差分 / 3-way マージ / ベースライン / `SyncPort` / オーケストレーション
- `src/components/SyncPanel.svelte` — フッターの同期 UI。OAuth コールバックもここが処理する
- `src/components/ui/ModalDialog.svelte` — 3 択の `choose` を加算的に追加（Esc は「何もしない」）
- `src/pages/privacy/index.astro` — プライバシーポリシー（index 対象）
- `.github/workflows/keep-supabase-awake.yml` — 週次 cron で 7 日間無アクセス停止を予防

## 検証

- 単体テスト: プロジェクション / 差分 / マージ / ベースライン / オーケストレーション。カバレッジ 95% ゲート維持
- **部分失敗時にベースラインが成功行のみ更新されることの回帰テスト**を含む
- E2E: 未ログイン表示 / バックアップ UI の非回帰 / **Supabase 全遮断でも所持登録とスコア計算が動くこと**
- 環境変数なしでの `astro build` が成功し、生成 HTML に同期 UI が含まれないことを確認

## 前提

Google OAuth の Client ID / Secret と migration の適用は #446 の手作業。**それが終わるまで本番でログインは機能しない**（環境変数はあるので UI は出るが認証が通らない）。

🤖 Generated with [Claude Code](https://claude.com/claude-code)
BODY
)"
```

---

## Self-Review

**1. 仕様カバレッジ** — 設計書の各節に対応するタスク:

| 設計書 | タスク |
|---|---|
| §2.1 不変条件 | Task 1（env 未設定で null）/ Task 17 Step 6（環境変数なしビルド） |
| §2.2 ファイル構成 | Task 1-14 |
| §2.3 認証フロー | Task 1（`detectSessionInUrl`）/ Task 14（`signInWithOAuth`） |
| §3.1 Drizzle の役割分担 | Task 2 / Task 10 |
| §3.2 テーブル | Task 2 |
| §3.3 手書き SQL | Task 2 Step 7 |
| §3.4 デッキ書き込みの原子性 | Task 2（`upsert_deck`）/ Task 10（`pushDeck`） |
| §4.1 版管理 | Task 2（トリガー）/ Task 9（`nextCursorRev`） |
| §4.2 ベースラインと 3-way | Task 7 / Task 9 / Task 11 |
| §4.3 プル | Task 10（`pull`） |
| §4.4 プッシュ | Task 10 / Task 11 |
| §4.5 部分失敗 | Task 12（回帰テスト 2 件） |
| §4.6 競合の提示粒度 | Task 12（kind 単位の resolver）/ Task 14（`KIND_LABELS`） |
| §4.7 初回リンクとアカウント切替 | Task 9（`reconcileUser`）/ Task 12 |
| §4.8 バックアップとの関係 | Task 8 / Task 14（`i7:backup-imported`） |
| §5.1-5.2 配置と表示状態 | Task 14 |
| §5.3 `choose` | Task 13 |
| §5.4 文言 | Task 14（`KIND_LABELS`・用語ポリシー） |
| §5.5 変更検知とデバウンス | Task 8 / Task 14 |
| §6 エラー処理 | Task 12（各分岐）/ Task 14（表示） |
| §7 プライバシー | Task 15 |
| §8 テスト | 各タスク / Task 17 |
| §9 運用 | Task 16 / Task 17 |

**2. 計画中に見つけて設計書へ反映した修正**

- `SavedDeck.id` は `Date.now().toString(36)` で **UUID ではない** → `decks.id` を `text` にし `(user_id, id)` の複合主キーへ。`deck_slots` にも `user_id` を持たせ、RLS を `exists(...)` から単純比較へ簡素化
- `timestamp` の既定モードは `InferSelectModel` が `Date` を返すが PostgREST は ISO 文字列を返す → 全 `timestamp` に `mode: 'string'`
- `upsert_deck` の変数 `deck_id` が列名と衝突し `where deck_id = deck_id` が恒真になる → `v_deck_id` に改名
- `rev` に `.default(0)` を付け、クライアントが `rev` を送らなくて済むように
- `vitest.config.ts` の coverage は `include: ['src/lib/**']` なので `db/**` は元から対象外 → 設定変更は不要
- sitemap `filter` は除外リスト方式なので `/privacy/` は既定で含まれる → `astro.config.mjs` の変更は不要
- `syncEngine` の依存を `SupabaseClient` ではなく `SyncPort` に絞り、PostgREST の擬似実装を不要に
- 初回リンクと競合ダイアログの 3 択は E2E の対象外とし、単体テストと手動確認でカバー（セッションのスタブは supabase-js の内部形式に依存して脆い）

**3. 型の一貫性** — `RowSet<V>` / `MergeVerdict<V>` / `PushResult` / `Adapter<V>` / `KindPlan` / `SyncReport` は定義タスク（3 / 7 / 10 / 11 / 12）と利用タスクで名称・シグネチャが一致している。`BaselineKind` は Task 9 で定義し Task 11・12・14 で参照。`reloadFromStorage`（cardCounts）と `reloadBroachCountsFromStorage`（broachCounts）はストアの実際の export 名。
