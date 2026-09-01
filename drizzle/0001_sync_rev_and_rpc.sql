-- 注意: このファイルは drizzle-kit generate --custom で作った手書き migration。
-- sync_cursor テーブルと関数・トリガーはここにしか定義がなく drizzle/meta/ の
-- スナップショットは関知していない。よって本プロジェクトで
-- `drizzle-kit push` / `drizzle-kit pull` を実行してはならない。
-- push はスナップショットに存在しない sync_cursor 等を「管理対象外」とみなし
-- DROP を提案しうる。pull も同様にスナップショットとの差分から誤った操作を導く。
-- migration の適用は `npx drizzle-kit migrate` を使うこと（CLAUDE.md / ADR 0064 と一致させる）。
-- psql や Supabase の SQL Editor で直接流し込むと drizzle の __drizzle_migrations
-- 追跡テーブルを迂回し、後から `drizzle-kit migrate` を実行したときに
-- "already exists" で失敗し手動修復が必要になる。

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

-- next_rev は security definer で RLS を迂回する。PostgREST は public スキーマの
-- 全関数を RPC として公開するため、EXECUTE を PUBLIC に残すと未認証の呼び出し元が
-- 任意ユーザーの sync_cursor を書けてしまう（かつ auth.users の FK エラーで
-- ユーザーの存在を判別できる）。
-- set_rev は security invoker のままだと呼び出し元権限で next_rev を呼ぶため、
-- revoke だけでは全 insert が permission denied になる。両方を必ず行うこと。
alter function public.set_rev() security definer;
revoke execute on function public.next_rev(uuid) from public, anon, authenticated;
--> statement-breakpoint

-- security definer 関数はオブジェクト参照がスキーマ修飾されていても、
-- 演算子・キャストの解決は search_path に従い、関数は migration を適用した
-- 広い権限のロールが所有する。search_path を固定しないと Supabase の
-- function_search_path_mutable linter が検出する問題になる。
alter function public.next_rev(uuid) set search_path = public, pg_catalog;
alter function public.set_rev() set search_path = public, pg_catalog;
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

alter function public.bump_deck_rev() set search_path = public, pg_catalog;
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
      (select array_agg(e.value::integer order by e.ord)
         from jsonb_array_elements_text(slot->'shared_broach_ids')
              with ordinality as e(value, ord)),
      '{}'::integer[]
    )
  from jsonb_array_elements(payload->'slots') as slot;

  select rev into result_rev from public.decks where user_id = uid and id = v_deck_id;
  return result_rev;
end $$;
--> statement-breakpoint

alter function public.upsert_deck(jsonb) set search_path = public, pg_catalog;
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
--> statement-breakpoint

alter function public.delete_all_sync_data() set search_path = public, pg_catalog;
