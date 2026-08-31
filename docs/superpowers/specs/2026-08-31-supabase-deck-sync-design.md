# Supabase による端末間同期 — 設計

- 日付: 2026-08-31
- 関連 ADR: [0064](../../adr/0064-supabase-server-sync.md)

## 1. 要件

| 項目 | 決定 |
|---|---|
| 認証 | Supabase Auth の Google プロバイダのみ |
| 同期モデル | 持ち替え型（PC ↔ スマートフォンを行き来。同時併用はほぼない） |
| トリガー | 自動アップロード（デバウンス）+ 起動時プル。競合時のみ利用者に確認 |
| 対象データ | 所持衣装数 / ラビットノート / 共通ブローチ所持数 / 保存デッキ |
| データモデル | 正規化（5 テーブル） |
| ORM | Drizzle（スキーマと migration の単一情報源。実行時クエリには使わない） |

同期対象外の localStorage キー: `i7_selected_songs` / `i7_score_calc_state` / `i7_point_calc_state` / `i7_compare_event_id` / `i7_max_finder_event_id` / `i7_card_list_view_mode`。作業中の一時状態と端末固有の表示設定であり、同期すると「別端末の作業途中に勝手に差し替わる」挙動になる。

## 2. アーキテクチャ

### 2.1 不変条件

> 同期は純粋な付加機能である。Supabase が落ちていても、環境変数が未設定でも、利用者が未ログインでも、サイトの全機能は localStorage のみで従来通り動作しなければならない。

実装上の担保:

- 既存の 13 箇所の `saveJson` 呼び出しは同期の成否を知らない。同期層が `storage.ts` を一方的に購読する片方向依存とする
- `storage.ts` は Supabase を import しない
- 環境変数が未設定なら `supabaseClient.ts` が `null` を返し、`SyncPanel` は何も描画しない（現在と完全に同一のフッターがビルドされる）

環境変数未設定時にビルドを失敗させないことは必須要件である。Dependabot の PR は通常の Actions Variables を参照できず、[ADR 0061](../../adr/0061-dependabot-target-main.md) により Dependabot は `main` 直行であるため、この経路の CI ビルドは常に環境変数なしで走る。

### 2.2 ファイル構成

新規:

| パス | 責務 |
|---|---|
| `db/schema.ts` | Drizzle スキーマ。テーブルと RLS ポリシーの単一情報源。`src/` の外に置く |
| `drizzle.config.ts` | `out: './drizzle'`、`schemaFilter: ['public']` |
| `drizzle/` | 生成された migration（commit する） |
| `src/lib/sync/supabaseClient.ts` | 環境変数から client を遅延生成。未設定なら `null` |
| `src/lib/sync/projection/` | localStorage の JSON ⇄ 行の集合（データ種別ごと、純関数） |
| `src/lib/sync/diff.ts` | ベースラインと現在の行集合を比較し 追加 / 変更 / 削除 を返す（純関数） |
| `src/lib/sync/baseline.ts` | 前回同期時の行集合の保持 |
| `src/lib/sync/cursor.ts` | 同期カーソル管理 |
| `src/lib/sync/syncEngine.ts` | pull / push のオーケストレーション。**client を引数で注入** |
| `src/components/SyncPanel.svelte` | フッターの同期 UI。OAuth コールバック処理も担う |
| `src/pages/privacy/index.astro` | プライバシーポリシー（`/privacy/`、index 対象） |

既存への変更:

| パス | 変更 |
|---|---|
| `src/lib/storage.ts` | `saveJson` の変更通知フック、`STORAGE_KEYS` へ 2 キー追加、`BACKUP_EXCLUDED_KEYS` |
| `src/components/FooterTools.svelte` | インポート復元後に同期状態をリセット |
| `src/components/ui/ModalDialog.svelte` | `choose`（3 択）を加算的に追加 |
| `src/layouts/BaseLayout.astro` | `SyncPanel` の島を追加 |
| `vitest.config.ts` | coverage exclude に `db/**` |
| `astro.config.mjs` | sitemap にプライバシーポリシーを含める |

`syncEngine.ts` が Supabase client を import せず注入で受け取ることが要点である。同期ロジック全体が Vitest で純粋にテストでき、既存のカバレッジ 95% ゲートを実 Supabase なしで満たせる。

### 2.3 認証フロー

`signInWithOAuth({ provider: 'google', options: { redirectTo: <現在のページ URL> } })`。`SyncPanel` は `BaseLayout` 経由で全ページに存在するため、Supabase から戻ってきた先で `detectSessionInUrl` が `?code=` を処理する。**専用のコールバックページは作らない。**

Supabase 側の Redirect URL 許可リストに本番 URL と `http://localhost:4321/**` を登録する。

## 3. スキーマ

### 3.1 Drizzle の役割分担

| 用途 | 担当 |
|---|---|
| テーブル定義 | Drizzle スキーマ |
| RLS ポリシー定義 | Drizzle スキーマ（`drizzle-orm/supabase`） |
| migration SQL 生成 | `drizzle-kit generate`（オフライン、DB 接続不要） |
| migration 適用 | `drizzle-kit migrate`（**手動のみ**。`DATABASE_URL` はローカル `.env` 限定） |
| 実行時クエリ | **supabase-js（PostgREST、JWT で RLS が効く）** |
| 実行時の型 | Drizzle スキーマから `InferSelectModel` で導出（`import type` のみ） |

TS のプロパティ名は列名と一致させ snake_case とする。`casing: 'snake_case'` は使わない。PostgREST のレスポンスは snake_case であり、camelCase にすると `InferSelectModel` の型と実際の値が食い違って変換層が増える。

### 3.2 テーブル

```ts
// db/schema.ts
import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint, boolean, check, integer, pgPolicy, pgTable,
  primaryKey, smallint, text, timestamp, uuid,
} from 'drizzle-orm/pg-core';
import { authUid, authUsers, authenticatedRole } from 'drizzle-orm/supabase';

/** 自分の行だけを読み書きできる 4 ポリシーを生成する */
function ownerPolicies(name: string, userId: AnyPgColumn) {
  const own = sql`${userId} = ${authUid}`;
  return [
    pgPolicy(`${name}_select`, { for: 'select', to: authenticatedRole, using: own }),
    pgPolicy(`${name}_insert`, { for: 'insert', to: authenticatedRole, withCheck: own }),
    pgPolicy(`${name}_update`, { for: 'update', to: authenticatedRole, using: own, withCheck: own }),
    pgPolicy(`${name}_delete`, { for: 'delete', to: authenticatedRole, using: own }),
  ];
}

export const card_counts = pgTable('card_counts', {
  user_id: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  card_id: integer('card_id').notNull(),
  count: integer('count').notNull(),
  rev: bigint('rev', { mode: 'number' }).notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.user_id, t.card_id] }),
  check('card_counts_count_range', sql`${t.count} >= 0`),
  ...ownerPolicies('card_counts', t.user_id),
]);
```

`rabbit_notes`（主キー `user_id + character`、列 `shout` / `beat` / `melody`）と `shared_broach_counts`（主キー `user_id + broach_id`、列 `count`）は同じ形。

```ts
export const decks = pgTable('decks', {
  id: uuid('id').primaryKey(),                    // 既存 SavedDeck.id をそのまま移行
  user_id: uuid('user_id').notNull().references(() => authUsers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  song_id: integer('song_id'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deleted_at: timestamp('deleted_at', { withTimezone: true }),   // tombstone
  rev: bigint('rev', { mode: 'number' }).notNull(),
}, (t) => [
  check('decks_name_len', sql`char_length(${t.name}) between 1 and 200`),
  ...ownerPolicies('decks', t.user_id),
]);

export const deck_slots = pgTable('deck_slots', {
  deck_id: uuid('deck_id').notNull().references(() => decks.id, { onDelete: 'cascade' }),
  slot_index: smallint('slot_index').notNull(),
  card_id: integer('card_id'),
  trained: boolean('trained').notNull().default(false),
  skill_level: smallint('skill_level'),
  bonus_tier: text('bonus_tier'),
  shared_broach_ids: integer('shared_broach_ids').array().notNull().default([]),
}, (t) => [
  primaryKey({ columns: [t.deck_id, t.slot_index] }),
  check('deck_slots_slot_range', sql`${t.slot_index} between 0 and 5`),
  // deck_slots は user_id を持たないので親の所有者を辿る
  pgPolicy('deck_slots_all', {
    for: 'all', to: authenticatedRole,
    using: sql`exists (select 1 from ${decks} d where d.id = ${t.deck_id} and d.user_id = ${authUid})`,
    withCheck: sql`exists (select 1 from ${decks} d where d.id = ${t.deck_id} and d.user_id = ${authUid})`,
  }),
]);
```

`deck_slots` に `rev` は持たせない。スロットの変更は親デッキの `rev` を上げる（デッキ + スロットを 1 つの集約として扱う）。

### 3.3 手書き SQL（`drizzle-kit generate --custom`）

テーブル定義ではないため Drizzle の DSL では表現できない。手書き migration として起こす。

```sql
create table public.sync_cursor (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rev bigint not null default 0
);

create function public.next_rev(uid uuid) returns bigint
language plpgsql security definer as $$
declare r bigint;
begin
  insert into public.sync_cursor (user_id, rev) values (uid, 1)
  on conflict (user_id) do update set rev = public.sync_cursor.rev + 1
  returning rev into r;
  return r;
end $$;

create function public.set_rev() returns trigger language plpgsql as $$
begin
  new.rev := public.next_rev(new.user_id);
  new.updated_at := now();
  return new;
end $$;
```

`card_counts` / `rabbit_notes` / `shared_broach_counts` / `decks` に `before insert or update ... for each row execute function public.set_rev()` を張る。`deck_slots` のトリガーは親 `decks` を更新して `rev` を繰り上げる。

さらにデッキ書き込み用の `upsert_deck(payload jsonb)` を `security invoker` で定義する（3.4）。

`sync_cursor` は RLS を有効化するがポリシーを張らない。クライアントから直接読み書きさせる必要がなく（カーソルは 4.1 の通り適用行の `rev` の最大値から求める）、`next_rev` は `security definer` なので RLS を迂回して更新できる。**ポリシーなし + RLS 有効 = クライアントからは一切アクセス不可**が最も狭い権限になる。

### 3.4 デッキ書き込みの原子性

デッキ 1 件の書き込みは `decks` 1 行 + `deck_slots` 6 行であり、PostgREST 経由で HTTP を分けると原子性がない。途中で失敗するとスロットだけ新しいデッキが残る。

`upsert_deck(payload jsonb)` を `security invoker` で定義し、1 回の呼び出しを 1 トランザクションとする。RLS はそのまま効く。削除（`deleted_at` の設定）もこの関数で行う。

所持数系は配列 upsert が単一文なので原子的であり、RPC は用いない。

## 4. 同期プロトコル

### 4.1 版管理

各行の `rev` はユーザーごとの単調増加カウンタからトリガーで採番する。クライアントは `rev` を送らず、送っても上書きされる。`updated_at` もサーバ側で設定するため、端末時計に一切依存しない。

増分プルのカーソルは **「実際に適用した行の `rev` の最大値」** とする。プルの途中で別端末の書き込みが入った場合、`sync_cursor.rev` を読んで採用すると未取得の行を飛ばす。最大値方式なら最悪でも次回に再取得するだけで取りこぼしが起きない。

### 4.2 ベースラインと 3-way 判定

`i7_sync_baseline` に「最後にサーバと一致していると確認できた行集合」を保持する。ベースライン B ／ ローカル現在 L ／ サーバ現在 S で行ごとに判定する。

| 判定 | 動作 |
|---|---|
| `S == B` かつ `L != B` | ローカルだけ変更 → push |
| `S != B` かつ `L == B` | サーバだけ変更 → 取り込む |
| `S != B` かつ `L != B` | 両方変更 → **競合** |
| `S == B` かつ `L == B` | 何もしない |

「未同期の変更あり」フラグは持たない。ベースラインとの差分そのものが未同期の変更を表すため、push が失敗しても次回の diff が同じ差分を再検出する。**同期処理全体がべき等**であり、オフライン中の変更も自然に持ち越される。

削除の判定も同じ枠組みで出る（ベースラインにあって現在にない行 = 削除）。所持数系は「0 を書く」ので、削除も通常の値変更として扱われる。

**ベースラインの更新は行単位に限る。** サーバへの反映が確認できた行だけを更新する。一括更新は禁止（4.5 参照）。

### 4.3 プル

`rev > cursor` で 4 テーブルを並列に引き、返ってきたデッキ ID で `deck_slots` を 1 回引く（最大 5 リクエスト、うち 4 つは並列）。

### 4.4 プッシュ

- 所持数系: 差分行だけを配列 upsert で 1 リクエスト
- デッキ: 変更のあったデッキごとに `upsert_deck` を 1 回
- 削除デッキ: `upsert_deck` 内で `deleted_at` を設定

### 4.5 部分失敗

ベースラインは「サーバへの反映が実際に確認できた行だけ」を行単位で更新する。失敗した行はベースラインが古いまま残り、次回の diff が同じ差分を再検出して再送する。**ベースラインを一括更新する実装は禁止。** 4.2 のべき等性はこの粒度に依存している。

### 4.6 競合の提示粒度

判定は行単位だが、提示は次の粒度とする。行単位での提示はしない（所持数が数百行競合すると操作不能になる）。

- 所持数系（`card_counts` / `rabbit_notes` / `shared_broach_counts`）→ **データ種別ごとに 1 回**
- デッキ → **デッキ単位**（名前を出せるので利用者が判断できる）

競合していないデータ種別・デッキは確認を待たずに通常同期される。これが正規化した実利である。

### 4.7 初回リンクとアカウント切替

ベースラインが無い状態（初回ログイン、別アカウントへの切替、バックアップ復元後）は 3-way の基準がない。**勝手にマージしない。** データ種別ごとに、両方に値があるときだけ 1 回だけ確認する。片方が空なら自動で解決する。

`i7_sync_meta` は `{ userId, cursorRev, lastSyncedAt }` のみを持つ。`userId` の不一致を検知したらベースラインとカーソルを破棄し、初回リンク扱いに戻す。

### 4.8 バックアップ機能との関係

`STORAGE_KEYS` に `SYNC_META` / `SYNC_BASELINE` を追加するが、`FooterTools` のエクスポート対象からは除外する（`BACKUP_EXCLUDED_KEYS`）。別端末のベースラインを取り込むと同期エンジンが「同期済み」と誤認して未同期の変更を取りこぼす。

併せてインポート復元後は同期状態をリセットする（ベースライン破棄 + カーソル 0 → 初回リンク扱い）。除外を忘れた将来の変更に対しても安全側に倒れる。

## 5. UI

### 5.1 配置

`src/components/SyncPanel.svelte` を `BaseLayout.astro` のフッターで `FooterTools` の隣に `client:load` で並べる。見せ方も既存に合わせ、テキストリンク状のボタン + 既存の `InlineAlert`（`tone` 付き）だけで構成する。

専用の `/account/` ページは作らない（[ADR 0057](../../adr/0057-focus-indexable-pages.md) のページ数を増やさない方針、およびバックアップ UI と同じ場所にある発見性）。`FooterTools` から分離するのは 2.1 の「同期層を削除しても既存機能が無傷」を守るため。

### 5.2 表示状態

| 状態 | 表示 |
|---|---|
| 環境変数未設定 | **何も描画しない** |
| 未ログイン | 「ログイン（端末間で同期）」 |
| 認証処理中 | 「ログイン中…」 |
| 同期済み | 「同期済み · 3 分前」／「ログアウト」 |
| 同期中 | 「同期中…」 |
| 未同期の変更あり | 「未同期の変更あり」／「今すぐ同期」 |
| 失敗 | `InlineAlert`（`tone="error"`）「同期できませんでした」／「再試行」 |
| — | 「サーバのデータを削除」（`danger` 確認を経由） |

状態テキストは `aria-live="polite"` の領域に置く。

配色は [ADR 0047](../../adr/0047-character-color-identity.md) の 3 チャンネル分離に従い無彩色に留める。成否を色で表さずテキストで表す。例外はエラー時の `InlineAlert` で、既存の `ModalDialog` の `danger` と同じ前例に沿う。

モーションは `src/lib/motion.ts` の `materialIn` / `materialOut` と `pressable` を使う。GSAP は使わない（[ADR 0054](../../adr/0054-gsap-home-motion.md) によりトップページ専用）。z-index は `ModalDialog` の既存スケール内に収まるため新規の値を導入しない（[ADR 0048](../../adr/0048-baseline-ui-compliance.md)）。

### 5.3 `ModalDialog` の `choose`

既存の `confirm` / `prompt` は 2 択で、Esc とバックドロップが cancel に解決される。ここに「別端末の内容を取り込む」を割り当てると Esc を押しただけでデータが上書きされる。加算的に 3 択を追加する。

```ts
type ChooseOptions = {
  title: string;
  message?: string;
  primaryLabel: string;
  secondaryLabel: string;
  dismissLabel?: string;   // 既定: 'あとで'
};

choose(opts: ChooseOptions): Promise<'primary' | 'secondary' | null>
```

**Esc / バックドロップ / 「あとで」はすべて `null`** に解決し、何もしない。競合は未解決のまま残り、次回の同期で再度聞かれる（4.2 のべき等性により放置しても壊れない）。既存の `confirm` / `prompt` の挙動は変えないため `DeckList` / `FooterTools` への影響はない。

### 5.4 文言

用語ポリシーに従い、可視テキストでは「カード」ではなく **「衣装」**、共有ブローチは **「共通ブローチ」** を使う。

競合（所持数系）:

> **所持衣装数が両方の端末で変更されています**
> この端末: 42 件を更新（5 分前） / 別の端末: 8 件を更新（1 時間前）
> 〔この端末の内容を使う〕〔別の端末の内容を使う〕〔あとで〕

競合（デッキ）:

> **デッキ「イベント用フル特効」が両方の端末で変更されています**
> 〔この端末の内容を使う〕〔別の端末の内容を使う〕〔あとで〕

初回リンク:

> **この端末のデータと、サーバのデータの両方に内容があります**
> どちらを残しますか。選ばなかった側は失われます。
> 〔この端末の内容を上げる〕〔サーバの内容を取り込む〕〔あとで〕

### 5.5 変更検知とデバウンス

`storage.ts` に通知フックを追加する。既存の 13 箇所の呼び出しは無変更。

```ts
type SaveListener = (key: string) => void;
export function onSave(fn: SaveListener): () => void;   // 購読解除を返す
```

`saveJson` の**書き込み成功後にのみ**通知する（quota 超過で書けなかった変更を同期対象にしない）。`storage.ts` は Supabase を知らない。

- 同期対象キーが書かれたら **3 秒デバウンス**して push（所持数の連続増減で毎回リクエストが飛ぶのを防ぐ）
- `visibilitychange` で `hidden` になったら即 flush。`beforeunload` は発火が不安定なので使わない
- 実行中の同期は 1 本に制限する。デバウンス待ち中に同期が走ったら完了後に再評価する
- 別タブの変更は `window` の `storage` イベントで拾う（同一タブでは発火しないため上記フックと役割が分かれる）

## 6. エラー処理

全エラー経路の既定動作は「何も書かずに状態表示だけ更新する」。

| 事象 | 動作 |
|---|---|
| オフライン / ネットワーク不通 | 状態表示のみ。自動リトライは入れず、次の変更・ページ遷移・「再試行」で再開 |
| 認証切れ・リフレッシュ失敗 | `onAuthStateChange` で検知して未ログイン扱いへ。**ベースラインは保持** |
| RLS 違反（`42501`） | 同期を停止しエラー表示。localStorage は触らない |
| 一意制約違反（`23505`） | 「別端末が先に作った」= 競合経路へ |
| `CHECK` 制約違反 | 同期停止 + エラー表示。データは触らない |
| 異常な行数・名前長 | push 前にクライアント側で検査する（1 回の push の行数上限、デッキ名の長さ）。超過分は送らず警告 |
| JSON パース失敗 | プロジェクションを中止（既存 `loadJson` の安全側方針と同じ） |
| localStorage quota 超過 | **ベースライン保存に失敗したら同期を無効化してエラー表示。** 勝手なマージには倒さない |
| Supabase プロジェクト一時停止 | エラー表示のみ（週次 cron で予防） |

## 7. プライバシー

正規化により、所持衣装という嗜好データが構造化された形でサーバに保管される。加えて `auth.users` に Google アカウントのメールアドレスと識別子が入る。

プライバシーポリシーページ（`src/pages/privacy/index.astro` → `/privacy/`）を新設する。[ADR 0057](../../adr/0057-focus-indexable-pages.md) の `noindex` 対象には**せず**、index 対象として sitemap にも含める（法的ページは検索から到達できる必要がある）。

記載事項: 取得する情報 / 保存されるデータ / 保存先とリージョン / 利用目的（端末間同期のみ）/ 第三者提供なし / 削除方法 / 問い合わせ先。

Supabase のリージョンは東京（ap-northeast-1）。レイテンシと、データの所在を説明しやすいことの両方が理由。

**アカウント自体の削除は問い合わせ対応とする。** フッターから同期データは全削除できるが、`auth.users` の行の削除には `service_role` 権限が必要でクライアントからは実行できない。Edge Function を置けば可能だが、それはサーバーサイドランタイムの追加導入であり ADR 0064 の上書き範囲を超える。データ全削除後に残るのは `auth.users` の 1 行のみ。この扱いをポリシーに明記する。

## 8. テスト

### 8.1 単体（Vitest）

ロジックはすべて純関数側に寄せ、既存のカバレッジ 95% ゲートを実 Supabase 抜きで満たす。

- `projection/*` — 4 データ種別 × 空 / 通常 / 不正 JSON / 境界値
- `diff.ts` — 追加 / 変更 / 削除 / 無変更、削除が「0 の書き込み」になること
- 3-way 判定 — 4.2 の 4 分岐 × データ種別
- `cursor.ts` — `max(rev)` 方式で取りこぼしが出ないこと
- `syncEngine.ts` — **フェイクの Supabase client（インメモリの擬似 PostgREST）を注入**し、競合・部分失敗・オフラインを再現
- **部分失敗時にベースラインが成功行のみ更新されること**（4.5 の禁止事項に対する回帰テスト）

`db/**` は実行時に import されないため coverage exclude に追加する。

### 8.2 E2E（Playwright）

実 Supabase には接続せず、`page.route` で `**/rest/v1/**` と `**/auth/v1/**` を全スタブする。`test` / `expect` は `tests/helpers/fixtures.ts` から import する（[ADR 0055](../../adr/0055-e2e-hydration-fixture.md)、必須）。

- 環境変数未設定時にフッターが従来通りであること
- ログイン後の初回リンクの 3 択
- 競合ダイアログの 3 択（Esc が「何もしない」であることを含む）
- **オフライン時にスコア計算・所持登録が無傷で動くこと**（最重要の回帰）

### 8.3 手動確認

実 Supabase に対する 2 端末での持ち替え、および migration の適用手順。

## 9. 運用

| 項目 | 内容 |
|---|---|
| Supabase 設定 | 東京リージョン / Google provider / Redirect URL に本番 URL と `http://localhost:4321/**` |
| 環境変数 | `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_PUBLISHABLE_KEY`。公開前提の値なので GitHub Actions では Secrets ではなく **Variables** |
| migration 適用 | `npx drizzle-kit migrate` を手動実行。`DATABASE_URL` はローカル `.env` のみ。CI には渡さない |
| 週次 cron | GitHub Actions から Supabase へ軽い REST リクエストを 1 本送り、7 日間無アクセスによる自動停止を防ぐ |

生成された migration SQL は適用前に必ず目視確認する。`schemaFilter: ['public']` がないと drizzle-kit が Supabase 管理下の `auth` スキーマを管理対象と解釈し、破壊的変更が混入しうる。
