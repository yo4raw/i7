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
