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
