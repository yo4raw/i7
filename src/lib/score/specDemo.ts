/**
 * 仕様解説ページ (src/pages/score-calc/spec.astro) 用のデモ数値生成モジュール。
 *
 * ビルド時（プリレンダリング）にのみ import され、tests/fixtures のスナップショットから
 * 固定デモ編成 × MONSTER GENERATiON の実数値を実エンジン関数で計算する。
 * 数値はすべてここで生成し、ページ側に手書きしない (ADR 0043)。
 * デモ衣装が fixtures から消えた場合は throw してビルドを失敗させる。
 */
import { allCards, allSongs, allBroachs } from '../../../tests/fixtures/index';
import type { Card } from '../data/fetchCardsJson';
import type { Song } from '../data/fetchSongsJson';
import { computeTeam } from './teamBuilder';
import { flattenNotes } from './noteFlattener';
import { computeGroupSizes, computeShrinkExclusion, type ShrinkExclusion } from './shrinkExclusion';
import {
  calcMinScore, calcMaxScore, calcExpectedScore, calcShrinkCoverage,
  calcCardSkillExpected, calcCardSkillMax, calcCardSkillMaxActivations,
  runSimulation,
} from './simulation';
import type {
  ComputedTeam, ExpectedScore, FlatNote, ScoreOptions, SimulationResult,
} from './types';

/** デモ編成の衣装 ID (Card.ID)。slot 0=センター, 1-4=メンバー, 5=フレンド */
export const DEMO_DECK_IDS = [1952, 3411, 1498, 3597, 3416, 1502] as const;
/** デモ楽曲: MONSTER GENERATiON */
export const DEMO_SONG_ID = 2;
/** ノーツ順・MC の決定論シード */
export const DEMO_NOTE_SEED = 7;
export const DEMO_MC_SEED = 42;
export const DEMO_MC_ITERATIONS = 1000;
/** デモの計算条件: アシスト OFF / バッジ 16% (UI 既定値) */
export const DEMO_OPTIONS: ScoreOptions = { scoreUpAssist: false, scoreUpBadgeRate: 16 };

export interface SpecDemoSlot {
  slotIndex: number;
  ID: number;
  name: string;
  cardname: string;
  rarity: string;
  attribute: 'Shout' | 'Beat' | 'Melody';
  skillType: string | null;
  count: number;
  per: number;
  value: number;
  rate: number;
  isShrink: boolean;
  isTimer: boolean;
  /** スキル期待値寄与（単独想定の目安） */
  skillExpected: number;
  /** スキル理論最大寄与（単独想定） */
  skillMax: number;
  /** 理論最大発動回数 */
  maxActivations: number;
}

export interface SpecDemo {
  song: Song;
  notesCount: number;
  groupSizes: Record<string, number>;
  deck: (Card | null)[];
  slots: SpecDemoSlot[];
  team: ComputedTeam;
  exclusion: ShrinkExclusion;
  notes: FlatNote[];
  expected: ExpectedScore;
  minScore: number;
  maxScore: number;
  coverage: NonNullable<ReturnType<typeof calcShrinkCoverage>>;
  mc: SimulationResult;
  options: ScoreOptions;
}

function findDemoCard(id: number): Card {
  const card = allCards.find(c => c.ID === id);
  /* v8 ignore next -- fixtures 欠落時にビルドを失敗させるガード（通常到達しない） */
  if (!card) throw new Error(`spec デモ衣装 ID=${id} が tests/fixtures/cards.json に存在しません`);
  return card;
}

/** デモ数値一式をビルド時に計算する */
export async function buildSpecDemo(): Promise<SpecDemo> {
  const song = allSongs.find(s => s.id === DEMO_SONG_ID);
  /* v8 ignore next -- fixtures 欠落時にビルドを失敗させるガード（通常到達しない） */
  if (!song) throw new Error(`spec デモ楽曲 id=${DEMO_SONG_ID} が tests/fixtures/songs.json に存在しません`);

  const deck: (Card | null)[] = DEMO_DECK_IDS.map(findDemoCard);
  const team = computeTeam(deck, allBroachs, song);

  const groupSizes = computeGroupSizes(song);
  const notesCount = Object.values(groupSizes).reduce((a, b) => a + b, 0);
  const exclusion = computeShrinkExclusion(team, groupSizes);
  const notes = flattenNotes(song, DEMO_NOTE_SEED, exclusion);

  const expected = calcExpectedScore(team, notes, notesCount, DEMO_OPTIONS);
  const minScore = calcMinScore(team, notes, DEMO_OPTIONS);
  const maxScore = calcMaxScore(team, notes, DEMO_OPTIONS);

  const coverage = calcShrinkCoverage(team, notesCount, 0, exclusion.totalExcluded);
  /* v8 ignore next -- デモデッキ定義が縮小 2 枚を含む限り到達しない */
  if (!coverage) throw new Error('spec デモ編成に縮小スキルが含まれていません (デッキ定義を確認)');

  const mc = await runSimulation(team, notes, DEMO_MC_ITERATIONS, undefined, DEMO_MC_SEED, DEMO_OPTIONS);

  const slots: SpecDemoSlot[] = team.cards.map(dc => ({
    slotIndex: dc.slotIndex,
    ID: dc.cardId,
    name: dc.name,
    cardname: dc.cardname,
    rarity: dc.rarity,
    attribute: dc.attribute,
    skillType: dc.skill?.originalType ?? null,
    count: dc.skill?.count ?? 0,
    per: dc.skill?.per ?? 0,
    value: dc.skill?.value ?? 0,
    rate: dc.skill?.rate ?? 0,
    isShrink: dc.skill?.isShrink ?? false,
    isTimer: dc.skill?.isTimer ?? false,
    skillExpected: calcCardSkillExpected(team, notes, notesCount, dc.slotIndex, DEMO_OPTIONS),
    skillMax: calcCardSkillMax(team, notes, notesCount, dc.slotIndex, DEMO_OPTIONS),
    maxActivations: calcCardSkillMaxActivations(team, notesCount, dc.slotIndex, exclusion.totalExcluded),
  }));

  return {
    song, notesCount, groupSizes, deck, slots, team, exclusion, notes,
    expected, minScore, maxScore, coverage, mc,
    options: DEMO_OPTIONS,
  };
}
