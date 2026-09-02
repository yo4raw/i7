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
