import { loadRabbitNotes, saveRabbitNotes } from '../data/rabbitNote';
import { STORAGE_KEYS, loadJson, saveJson } from '../storage';
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
  /** localStorage へ書き戻す。関連する Svelte ストアの再読込もここで行う */
  writeLocal(rows: RowSet<V>): void;
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
    saveJson(STORAGE_KEYS.CARD_COUNTS, rowSetToCountMap(rows));
    reloadCardCounts();
  },
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
    saveJson(STORAGE_KEYS.SHARED_BROACH_COUNTS, rowSetToCountMap(clampRowSet(rows, MAX_BROACH_COUNT)));
    reloadBroachCountsFromStorage();
  },
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
  writeLocal: (rows) => saveRabbitNotes(rowSetToRabbitMap(rows)),
  serverRowSet: (pulled) => rabbitRowsToRowSet(pulled.rabbit_notes),
  serverRevs: (pulled) => pulled.rabbit_notes.map((row) => row.rev),
  equals: rabbitEquals,
  push: (port, entries) =>
    port.pushRabbitNotes(entries.map(([key, value]) => ({ key, value: value ?? ZERO_NOTE }))),
};

const decksAdapter: Adapter<SyncedDeck> = {
  kind: 'decks',
  localRowSet: () => savedDecksToRowSet(loadJson<SavedDeck[]>(STORAGE_KEYS.SAVED_DECKS, [])),
  writeLocal: (rows) => saveJson(STORAGE_KEYS.SAVED_DECKS, rowSetToSavedDecks(rows)),
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
      loadBaselineRowSet<unknown>(adapter.kind),
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

  const verdicts = mergeRowSets<V>(
    baseline,
    adapter.localRowSet(),
    server,
    adapter.equals,
  );
  return {
    kind: adapter.kind,
    verdicts: verdicts as MergeVerdict<unknown>[],
    conflictKeys: verdicts.filter((v) => v.kind === 'conflict').map((v) => v.key),
    serverRevs: adapter.serverRevs(pulled),
  };
}
