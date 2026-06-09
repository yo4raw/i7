import type { Card } from '../../../../src/lib/data/fetchCardsJson';
import type { Song, SongNoteGroup } from '../../../../src/lib/data/fetchSongsJson';
import { allCards, findSongById } from '../../../fixtures/index';
import type { GoldenCase } from '../../../fixtures/golden/loadGolden';
import type { OracleInput, NoteStage } from '../../../oracle/oracleTypes';

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

/** ゴールデンケース → オラクル入力。engine を一切経由せず生入力を組み立てる。 */
export function buildOracleInput(gc: GoldenCase): OracleInput {
  const deck = gc.deck.map((id) => findCardByMasterId(id));
  const song = findSongById(gc.songId);
  const eventMultipliers = gc.deck.map((_, i) => {
    const tier = gc.eventTiers?.[i] ?? 'none';
    return EVENT_TIER_MULTIPLIER[tier] ?? 1.0;
  });

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
    // golden #1 はブローチ・ラビットノート無し（属性値加算 0）
    broachAttr: { shout: 0, beat: 0, melody: 0 },
    rabbitAttr: { shout: 0, beat: 0, melody: 0 },
    badgeRate: gc.badgeRate,
    assist: gc.assist,
  };
}
