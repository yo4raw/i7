import type { Card } from '../../../../src/lib/data/fetchCardsJson';
import type { Song, SongNoteGroup } from '../../../../src/lib/data/fetchSongsJson';
import { allCards, findSongById, allBroachs } from '../../../fixtures/index';
import type { GoldenCase } from '../../../fixtures/golden/loadGolden';
import type { OracleInput, NoteStage } from '../../../oracle/oracleTypes';
// データ定義のみの import（属性別の加算値テーブル）。ロジック(broachResolver.ts / teamBuilder.ts)は
// engine 実装のため経由しない — オラクルの独立性を保つ。
import { SHARED_BROACHS } from '../../../../src/lib/data/sharedBroachs';

/**
 * イベント特効ランク → カード別倍率 `(1 + 特効率)`。
 * スプレッドシート AM29 `ROUND(stat × (1 + AM28))` の `(1 + AM28)` に相当。
 * オラクルの独立性を保つため engine の定数を import せず、ここで定義する
 * (値は ota-life スプレッドシート設定シート `$B$6:$C$9` に準拠)。
 */
const EVENT_TIER_MULTIPLIER: Record<string, number> = {
  none: 1.0,
  bronze: 2.0, // 銅特効 (+100%)
  silver: 2.2, // 銀特効 (+120%)
  gold: 2.4, // 金特効 (+140%)
};

/** ステージグループ → ライト倍率（スプレッドシート AZ11:AZ17 / engine LIGHT_MULTIPLIER と同値） */
const STAGE_LIGHT: { group: keyof Song; light: number }[] = [
  { group: 'notes_20', light: 1.0 },
  { group: 'light_2', light: 1.0 },
  { group: 'light_3', light: 1.1 },
  { group: 'light_4', light: 1.2 },
  { group: 'light_5', light: 1.3 },
  { group: 'light_6', light: 1.5 },
  { group: 'chorus_light_5', light: 2.6 },
  { group: 'chorus_light_6', light: 3.0 },
];

const ATTR_KEYS: { attribute: NoteStage['attribute']; prefix: 'shout' | 'beat' | 'melody' }[] = [
  { attribute: 'Shout', prefix: 'shout' },
  { attribute: 'Beat', prefix: 'beat' },
  { attribute: 'Melody', prefix: 'melody' },
];

/** 楽曲データを per-stage × 属性 × 白/色 の NoteStage[] に展開する。 */
function toNoteStages(song: Song): NoteStage[] {
  const stages: NoteStage[] = [];
  for (const { group, light } of STAGE_LIGHT) {
    const grp = song[group] as SongNoteGroup | undefined;
    if (!grp) continue;
    for (const { attribute, prefix } of ATTR_KEYS) {
      const white = grp[`${prefix}_white` as keyof SongNoteGroup] || 0;
      const color = grp[`${prefix}_color` as keyof SongNoteGroup] || 0;
      if (white > 0) stages.push({ attribute, type: 'white', light, count: white });
      if (color > 0) stages.push({ attribute, type: 'color', light, count: color });
    }
  }
  return stages;
}

/** カード master `ID` 列で引く（ゴールデンのデッキは cardID ではなく ID 列）。 */
function findCardByMasterId(id: number): Card {
  const card = allCards.find((c) => c.ID === id);
  if (!card) throw new Error(`master ID=${id} のカードが fixture に存在しません`);
  return card;
}

/**
 * GoldenCase.broachs（固有ブローチ id 配列）の shout/beat/melody を単純合算する。
 * 固有ブローチは対象カードをデッキに含むだけで自動適用される
 * （スプレッドシート H29 等「ブローチ Beat 合計」に固有ブローチ分が無条件で加算されている＝
 * golden-notes.md Step 2 のクロスチェック参照）。
 */
function sumFixedBroachs(ids: number[]): { shout: number; beat: number; melody: number } {
  let shout = 0;
  let beat = 0;
  let melody = 0;
  for (const id of ids) {
    const broach = allBroachs.find((b) => b.id === id);
    if (!broach) throw new Error(`fixed broach id=${id} が fixture(broachs.json) に存在しません`);
    shout += broach.shout || 0;
    beat += broach.beat || 0;
    melody += broach.melody || 0;
  }
  return { shout, beat, melody };
}

/** デッキ6枠の属性別カード枚数（共有ブローチの条件付き加算 `targetAttribute` の倍率に使う）。 */
function countByAttribute(deck: Card[]): Record<'Shout' | 'Beat' | 'Melody', number> {
  const counts: Record<'Shout' | 'Beat' | 'Melody', number> = { Shout: 0, Beat: 0, Melody: 0 };
  for (const card of deck) {
    if (card.attribute === 'Shout' || card.attribute === 'Beat' || card.attribute === 'Melody') {
      counts[card.attribute]++;
    }
  }
  return counts;
}

/**
 * GoldenCase.sharedBroachs（スロット別 id 配列）の shout/beat/melody を集計する。
 * `targetAttribute` 付きブローチ（例: id25 B属性枚数分Beat+300）はデッキ内の対象属性カード枚数
 * を乗じる（スプレッドシート `ブローチ登録` シートの 種類3(属性カウント) 相当）。
 */
function sumSharedBroachs(
  sharedBroachs: number[][],
  deck: Card[],
): { shout: number; beat: number; melody: number } {
  const attrCounts = countByAttribute(deck);
  let shout = 0;
  let beat = 0;
  let melody = 0;
  for (const slotIds of sharedBroachs) {
    for (const id of slotIds) {
      const sb = SHARED_BROACHS.find((s) => s.id === id);
      if (!sb) throw new Error(`shared broach id=${id} が src/lib/data/sharedBroachs.ts に存在しません`);
      const mult = sb.targetAttribute ? attrCounts[sb.targetAttribute] : 1;
      shout += sb.shout * mult;
      beat += sb.beat * mult;
      melody += sb.melody * mult;
    }
  }
  return { shout, beat, melody };
}

/** ゴールデンケース → オラクル入力。engine を一切経由せず生入力を組み立てる。 */
export function buildOracleInput(gc: GoldenCase): OracleInput {
  const deck = gc.deck.map((id) => findCardByMasterId(id));
  const song = findSongById(gc.songId);
  const eventMultipliers = gc.deck.map((_, i) => {
    const tier = gc.eventTiers?.[i] ?? 'none';
    return EVENT_TIER_MULTIPLIER[tier] ?? 1.0;
  });

  const fixed = sumFixedBroachs(gc.broachs);
  const shared = sumSharedBroachs(gc.sharedBroachs, deck);
  const broachAttr = {
    shout: fixed.shout + shared.shout,
    beat: fixed.beat + shared.beat,
    melody: fixed.melody + shared.melody,
  };

  return {
    deck,
    center: gc.center,
    friend: gc.friend,
    song: {
      notes: gc.notes,
      duration: gc.duration,
      noteStages: toNoteStages(song),
    },
    trained: gc.trained,
    skillLevels: gc.skillLevels,
    eventMultipliers,
    broachAttr,
    // golden ケースはすべてラビットノート未登録（GoldenCase.rabbitNotes = {}）
    rabbitAttr: { shout: 0, beat: 0, melody: 0 },
    badgeRate: gc.badgeRate,
    assist: gc.assist,
  };
}
