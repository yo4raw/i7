/**
 * スコアシミュレーションモジュール: 理論値（最低/最高）・期待値・モンテカルロシミュレーションを計算する。
 * engine.ts から分割（コードは移動のみ、ロジック変更なし）。
 */
import type {
  AttributeName, FlatNote, CardSkill,
  ComputedTeam, SimulationResult, CardSkillStats, ScoreOptions,
  ExpectedScore,
} from './types';
import {
  NOTE_RATE, LIGHT_MULTIPLIER,
  SCOREUP_ASSIST_RATE,
  MC_CHUNK_SIZE,
} from './constants';
import { Sfc32 } from './rng';
import { SKILL_TYPE } from '../data/fetchCardsJson';

/**
 * SCOREUPバッジ倍率を最終スコアに乗算で反映し、ブローチのスコア直接加算を加える。
 * 仕様（docs/shrink-skill-spec.md §1 / docs/score_calc_spec.md §3-7 準拠）:
 *   スコアアップアシスト (+20%) は属性値段階で適用済みのため、ここでは乗じない。
 *   finalScore = floor(baseTotal × (1 + badgeRate/100)) + broachScoreBonus
 */
function applyFinalBonus(baseTotal: number, team: ComputedTeam, options?: ScoreOptions): number {
  const badgeRateRaw = options?.scoreUpBadgeRate ?? 0;
  const badgeMult = badgeRateRaw > 0 ? 1 + badgeRateRaw / 100 : 1;
  return Math.floor(baseTotal * badgeMult) + team.broachScoreBonus;
}

/**
 * スコアアップアシストを属性値段階で適用した appeal を返す。
 * docs/score_calc_spec.md §3-7 準拠: teamXxxAssisted = floor(teamXxx × 1.2)
 */
function getAppeal(team: ComputedTeam, attr: AttributeName, assist: boolean): number {
  const raw = team[attr];
  return assist ? Math.floor(raw * (1 + SCOREUP_ASSIST_RATE)) : raw;
}

/**
 * 1 ノーツのスコアを計算。
 * 属性値に NOTE_RATE を乗じて floor した「1 ノーツ基底値」にステージ倍率を乗じて再度 floor する
 * (docs/score_calc_spec.md §5 準拠)。
 */
export function calcNoteScore(appeal: number, note: FlatNote): number {
  const perNoteBase = Math.floor(appeal * NOTE_RATE[note.type]);
  return Math.floor(perNoteBase * LIGHT_MULTIPLIER[note.group]);
}

/**
 * 先頭除外ノートに対応する秒数を、ノート密度一定の仮定で秒換算する。
 * 縮小スキルは先頭除外区間で発動できないため、カバー率の分母 (実効秒数) から控除する。
 */
function shrinkHeadSeconds(songDuration: number, notesCount: number, excludeHeadCount: number): number {
  if (notesCount <= 0) return 0;
  return (excludeHeadCount / notesCount) * songDuration;
}

/**
 * 縮小カバー率を計算する (docs/shrink-skill-spec.md §3, §4 準拠)。
 *
 * 仕様:
 *  - 各縮小スキルの「カバー秒 ({@link shrinkCoverageSeconds}: denom/count を小数のまま
 *    value と乗算しカード単位で 1 回だけ floor、spec §6-6 H39 準拠)」を単純加算 (rawCoveredSeconds)
 *  - 各縮小スキルの「カバー秒 × per/100 (同じくカード単位で 1 回だけ floor)」を単純加算 (rawExpectedCoveredSeconds)
 *  - 実効秒数 effectiveSeconds = songDuration − offsetSeconds − 先頭除外秒数
 *    (先頭除外区間では縮小が発動できないため分母から控除する)
 *  - 内部計算用カバー率は effectiveSeconds で必ず 100% キャップ
 *  - 表示用 raw* は 100% 超過可 (UI 側で注記する)
 *  - 期待値スコア用の expectedWeightedCoverageRate はスキルごとに (rateᵢ−1) を加重し、
 *    構造的到達可能秒数 (effectiveSeconds − 最小 count ノーツ分) でキャップする (ADR 0036)
 *
 * @param excludeHeadCount 先頭から縮小発動判定対象外とするノート数。
 *   通常は {@link computeShrinkExclusion} の `totalExcluded` を渡す
 *   (= max(notes_20サイズ, デッキ縮小スキル count の最小値))。
 */
export function calcShrinkCoverage(
  team: ComputedTeam,
  notesCount: number,
  offsetSeconds: number = 0,
  excludeHeadCount: number = 0,
): {
  /** 内部計算用カバー率 (100% キャップ済み、スコア計算で使用) */
  coverageRate: number;
  coveredSeconds: number;
  /** 生の単純合計カバー率 (100% 超可、表示用) */
  rawCoverageRate: number;
  rawCoveredSeconds: number;
  /** 内部計算用期待カバー率 (100% キャップ済み、期待値スコアで使用) */
  expectedCoverageRate: number;
  expectedCoveredSeconds: number;
  /** 生の単純加算期待カバー率 (100% 超可、表示用) */
  rawExpectedCoverageRate: number;
  rawExpectedCoveredSeconds: number;
  /** rate 加重・構造キャップ済みの期待カバー率 (期待値スコア専用、ADR 0036) */
  expectedWeightedCoverageRate: number;
  effectiveSeconds: number;
} | null {
  const shrinkCards = team.cards.filter(dc => dc.skill?.isShrink && dc.skill.count > 0);
  if (shrinkCards.length === 0) return null;

  const zero = {
    coverageRate: 0, coveredSeconds: 0,
    rawCoverageRate: 0, rawCoveredSeconds: 0,
    expectedCoverageRate: 0, expectedCoveredSeconds: 0,
    rawExpectedCoverageRate: 0, rawExpectedCoveredSeconds: 0,
    expectedWeightedCoverageRate: 0,
    effectiveSeconds: 0,
  };
  const headSeconds = shrinkHeadSeconds(team.songDuration, notesCount, excludeHeadCount);
  const effectiveSeconds = team.songDuration - offsetSeconds - headSeconds;
  if (effectiveSeconds <= 0) return zero;
  if (notesCount <= 0) return { ...zero, effectiveSeconds };

  // 各スキルの発動回数 × 持続秒 (と × 確率 / × (rate−1) 加重) を単純加算 (ADR 0036)
  let rawCoveredSeconds = 0;
  let rawExpectedCoveredSeconds = 0;
  let rawExpectedWeightedSeconds = 0; // Σ 期待カバー秒ᵢ × (rateᵢ − 1)
  let minNoteShrinkCount = Infinity;  // ノート型縮小の count 最小値 (構造キャップ用)
  for (const dc of shrinkCards) {
    const skill = dc.skill!;
    rawCoveredSeconds += shrinkCoverageSeconds(skill, team, notesCount, excludeHeadCount, true);
    const expSec = shrinkCoverageSeconds(skill, team, notesCount, excludeHeadCount, false);
    rawExpectedCoveredSeconds += expSec;
    rawExpectedWeightedSeconds += expSec * (skill.rate - 1.0);
    if (!isShrinkTimer(skill) && skill.count < minNoteShrinkCount) minNoteShrinkCount = skill.count;
  }

  // 構造的到達可能秒数キャップ (ADR 0036):
  // 理論最大値の発動モデルでもノート型縮小は先頭 count ノーツ分をカバーできないため、
  // 期待カバー秒の上限を effectiveSeconds からその区間だけ控除した値にする。
  const headCapSeconds = Number.isFinite(minNoteShrinkCount)
    ? (minNoteShrinkCount / notesCount) * team.songDuration
    : 0;
  const capSeconds = Math.max(0, effectiveSeconds - headCapSeconds);

  // 表示用カバー率は従来どおり effectiveSeconds でキャップ、期待値系は capSeconds でキャップ
  const coveredSeconds = Math.min(rawCoveredSeconds, effectiveSeconds);
  const expectedCoveredSeconds = Math.min(rawExpectedCoveredSeconds, capSeconds);
  const expectedScale = rawExpectedCoveredSeconds > capSeconds && rawExpectedCoveredSeconds > 0
    ? capSeconds / rawExpectedCoveredSeconds
    : 1;
  const expectedWeightedCoverageRate =
    (rawExpectedWeightedSeconds * expectedScale) / effectiveSeconds;

  return {
    coverageRate: coveredSeconds / effectiveSeconds,
    coveredSeconds,
    rawCoverageRate: rawCoveredSeconds / effectiveSeconds,
    rawCoveredSeconds,
    expectedCoverageRate: expectedCoveredSeconds / effectiveSeconds,
    expectedCoveredSeconds,
    rawExpectedCoverageRate: rawExpectedCoveredSeconds / effectiveSeconds,
    rawExpectedCoveredSeconds,
    expectedWeightedCoverageRate,
    effectiveSeconds,
  };
}

/** スキル全不発の最低スコア */
export function calcMinScore(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  const assist = options?.scoreUpAssist ?? false;
  let total = 0;
  for (const note of notes) {
    total += calcNoteScore(getAppeal(team, note.attribute, assist), note);
  }
  return applyFinalBonus(total, team, options);
}

/**
 * キューイング時の縮小区間を保持する内部型。
 * 実ゲーム仕様（shrink-skill-spec.md §1-1）: 同時刻にオーバーラップせず、先行区間の終了後に連続発動する。
 */
interface ShrinkQueueItem {
  durationNotes: number;
  rate: number;
  sourceCard: number;
}

interface ActiveShrink {
  endNote: number;
  rate: number;
  sourceCard: number;
}

/** 縮小区間の持続ノート数を秒→ノート換算で算出（曲終了で自然に切り詰める前提） */
function shrinkDurationNotes(valueSeconds: number, songDuration: number, totalNotes: number): number {
  if (songDuration <= 0 || totalNotes <= 0) return 0;
  return Math.floor((valueSeconds / songDuration) * totalNotes);
}

function isShrinkTimer(skill: CardSkill): boolean {
  return skill.isShrink && skill.originalType === SKILL_TYPE.SHRINK_TIMER;
}

function calcNoteIndexAtTime(seconds: number, songDuration: number, totalNotes: number): number {
  if (songDuration <= 0 || totalNotes <= 0) return -1;
  return Math.min(Math.floor((seconds / songDuration) * totalNotes), totalNotes - 1);
}

function calcShrinkActivationCount(
  skill: CardSkill,
  team: ComputedTeam,
  notesCount: number,
  excludeHeadCount: number,
): number {
  /* v8 ignore next -- 全呼出元が count>0 を保証しており count<=0 でここへ到達しない */
  if (skill.count <= 0) return 0;
  if (isShrinkTimer(skill)) {
    return team.songDuration > 0 ? Math.floor(team.songDuration / skill.count) : 0;
  }
  const eligibleCount = Math.max(0, notesCount - excludeHeadCount);
  return Math.floor(eligibleCount / skill.count);
}

/**
 * カード別の縮小カバー秒 (spec §6-6 H39 準拠)。
 * denom/count を小数のまま per/100(full 時は 1)× value と乗算し、カード単位で 1 回だけ floor。
 * ノート型は先頭除外後の対象ノーツ数、タイマー型は songDuration を分母にする (I1 維持)。
 */
function shrinkCoverageSeconds(
  skill: CardSkill,
  team: ComputedTeam,
  notesCount: number,
  excludeHeadCount: number,
  full: boolean,
): number {
  if (skill.count <= 0) return 0;
  const denom = isShrinkTimer(skill)
    ? team.songDuration
    : Math.max(0, notesCount - excludeHeadCount);
  if (denom <= 0) return 0;
  const perFactor = full ? 1 : skill.per / 100;
  return Math.floor((denom / skill.count) * perFactor * skill.value);
}

function enqueueShrink(
  queue: ShrinkQueueItem[],
  activeShrink: ActiveShrink | null,
  startNote: number,
  durationNotes: number,
  rate: number,
  sourceCard: number,
): ActiveShrink | null {
  if (durationNotes <= 0) return activeShrink;
  if (activeShrink == null) {
    return { endNote: startNote + durationNotes, rate, sourceCard };
  }
  queue.push({ durationNotes, rate, sourceCard });
  return activeShrink;
}

/** スキル全発動の最高スコア */
export function calcMaxScore(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  return applyFinalBonus(calcMaxBaseTotal(team, notes, options), team, options);
}

/** 理論最大スコアの段階別内訳（バッジ・ブローチ適用前） */
export interface MaxScoreBreakdown {
  baseScore: number;
  scoreUpMax: number;
  shrinkMax: number;
  total: number;
}

/** スキル全発動時のバッジ・ブローチ適用前の内訳 (spec §6-6 H38(B12=TRUE)/H40(B15=TRUE) の按分式移植。B8 / ADR 0044) */
export function calcMaxScoreBreakdown(
  team: ComputedTeam,
  notes: FlatNote[],
  options?: ScoreOptions,
): MaxScoreBreakdown {
  const N = notes.length;
  const assist = options?.scoreUpAssist ?? false;
  const notesCount = N;

  // 属性値素点(アシスト込み)と縮小対象素点(I1: excluded 除外)
  let baseScore = 0;
  let eligibleBaseScore = 0;
  let excludedCount = 0;
  for (const note of notes) {
    const s = calcNoteScore(getAppeal(team, note.attribute, assist), note);
    baseScore += s;
    if (note.excluded) { excludedCount++; continue; }
    eligibleBaseScore += s;
  }

  // スコアアップ理論値: カード別 floor((denom/count) × value) (H38 の B12=TRUE 形)
  let scoreUpMax = 0;
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (!skill || skill.isShrink || skill.count <= 0) continue;
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) continue;
    scoreUpMax += Math.floor((denom / skill.count) * skill.value);
  }

  // 縮小理論値: H40 の按分式 (B15=TRUE、BN22 基準、I1 の effectiveSeconds)
  let shrinkMax = 0;
  const shrinkCards = team.cards.filter(dc => dc.skill?.isShrink && dc.skill.count > 0);
  if (shrinkCards.length > 0) {
    const headSeconds = shrinkHeadSeconds(team.songDuration, notesCount, excludedCount);
    const effectiveSeconds = team.songDuration - headSeconds;
    if (effectiveSeconds > 0) {
      const shrinkBase = assist ? Math.floor(eligibleBaseScore / 1.2) : eligibleBaseScore;
      const secs = shrinkCards.map(dc =>
        shrinkCoverageSeconds(dc.skill!, team, notesCount, excludedCount, true));
      const totalSec = secs.reduce((a, b) => a + b, 0);
      if (totalSec > 0) {
        for (let i = 0; i < shrinkCards.length; i++) {
          const rate = shrinkCards[i].skill!.rate;
          const ratio = totalSec >= effectiveSeconds
            ? secs[i] / totalSec                 // 飽和: 秒数比按分
            : secs[i] / effectiveSeconds;        // 未飽和: 実効秒数比
          shrinkMax += Math.floor(shrinkBase * ratio * (rate - 1.0));
        }
      }
    }
  }

  return { baseScore, scoreUpMax, shrinkMax, total: baseScore + scoreUpMax + shrinkMax };
}

/** スキル全発動時のバッジ・ブローチ適用前の合計 */
function calcMaxBaseTotal(team: ComputedTeam, notes: FlatNote[], options?: ScoreOptions): number {
  return calcMaxScoreBreakdown(team, notes, options).total;
}

/**
 * 算術期待値によるスコア計算 (docs/shrink-skill-spec.md §5-3 / ADR 0036 準拠)。
 * - 属性値による楽曲スコア: スキル全不発時の素点合計（アシスト適用後）
 * - スコアアップ期待値: Σ( (タイマーなら songDuration, 通常なら notesCount) / count × per/100 × value )
 * - 縮小期待値: shrinkBase(アシスト剥離後 BN22) × Σ(期待カバー秒ᵢ × (rateᵢ−1)) / effectiveSeconds
 *   （構造的到達可能秒数キャップ付き。単一 rate の編成では旧 maxRate 式と同値）
 */
export function calcExpectedScore(
  team: ComputedTeam,
  notes: FlatNote[],
  notesCount: number,
  options?: ScoreOptions,
): ExpectedScore {
  const assist = options?.scoreUpAssist ?? false;

  // 属性値による楽曲スコア（アシスト適用後の素点で合算）
  let baseScore = 0;
  for (const note of notes) {
    baseScore += calcNoteScore(getAppeal(team, note.attribute, assist), note);
  }

  // スコアアップスキル期待値: カード別に (denom/count 小数のまま) × per/100 × value を
  // 計算し、カード単位で 1 回だけ floor して合算する (spec §6-6 H38 / B5)
  let scoreUpExpected = 0;
  for (const dc of team.cards) {
    const skill = dc.skill;
    if (!skill || skill.isShrink) continue;
    if (skill.count <= 0) continue;
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) continue;
    scoreUpExpected += Math.floor((denom / skill.count) * (skill.per / 100) * skill.value);
  }

  // 縮小期待値: excluded ノートを除いた対象素点 × rate 加重期待カバー率 (ADR 0036)
  const excludedCount = notes.filter(n => n.excluded).length;
  let eligibleBaseScore = 0;
  for (const note of notes) {
    if (note.excluded) continue;
    eligibleBaseScore += calcNoteScore(getAppeal(team, note.attribute, assist), note);
  }

  let shrinkExpected = 0;
  const coverage = calcShrinkCoverage(team, notesCount, 0, excludedCount);
  if (coverage && coverage.effectiveSeconds > 0) {
    // 縮小基準スコアはアシスト剥離後を使う (spec §6-5 BN22 / B6)。I1 の excluded 除外は維持
    const shrinkBase = assist ? Math.floor(eligibleBaseScore / 1.2) : eligibleBaseScore;
    shrinkExpected = Math.floor(shrinkBase * coverage.expectedWeightedCoverageRate);
  }

  let liveEndScore = baseScore + scoreUpExpected + shrinkExpected;

  // 不変条件 expected ≤ max の保証 (ADR 0036):
  // 縮小の秒→ノート離散化やキュー配信順の近似誤差による僅かな超過を、
  // スキル全発動時の同段階合計でクランプする (applyFinalBonus は単調のため最終値も max 以下になる)。
  if (coverage) {
    const maxBaseTotal = calcMaxBaseTotal(team, notes, options);
    if (liveEndScore > maxBaseTotal) {
      liveEndScore = maxBaseTotal;
      shrinkExpected = Math.max(0, liveEndScore - baseScore - scoreUpExpected);
    }
  }

  const finalScore = applyFinalBonus(liveEndScore, team, options);

  return { baseScore, scoreUpExpected, shrinkExpected, liveEndScore, finalScore };
}

/**
 * 単一カードのスキル期待値（当該カードのみが縮小スキルを持つと仮定）。
 * - スコアアップ / タイマー: floor( (denom/count) × per/100 × value )（H38 準拠、活動回数を
 *   小数のまま保持し最後に1回だけ floor する。denom は notesCount またはタイマー系なら songDuration）
 * - 判定縮小: shrinkBase(アシスト時 floor(eligibleBaseScore/1.2)、BN22) × (rate - 1) × 期待カバー率
 *   (当該カード単独で offset=0)
 *
 * 複数縮小スキルの max rate 合成は考慮しないため、デッキに複数の縮小スキルがある場合の
 * 合計期待値とは一致しない（カード単独寄与の目安として表示用）。
 */
export function calcCardSkillExpected(
  team: ComputedTeam,
  notes: FlatNote[],
  notesCount: number,
  slotIndex: number,
  options?: ScoreOptions,
): number {
  const dc = team.cards.find(c => c.slotIndex === slotIndex);
  if (!dc || !dc.skill || dc.skill.count <= 0) return 0;
  const skill = dc.skill;
  const assist = options?.scoreUpAssist ?? false;

  if (!skill.isShrink) {
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) return 0;
    return Math.floor((denom / skill.count) * (skill.per / 100) * skill.value);
  }

  const excludedCount = notes.filter(n => n.excluded).length;
  const effectiveSeconds = team.songDuration - shrinkHeadSeconds(team.songDuration, notesCount, excludedCount);
  if (effectiveSeconds <= 0) return 0;
  const expectedSec = Math.min(
    shrinkCoverageSeconds(skill, team, notesCount, excludedCount, false),
    effectiveSeconds,
  );
  if (expectedSec <= 0) return 0;
  const coverageRate = expectedSec / effectiveSeconds;

  let eligibleBaseScore = 0;
  for (const n of notes) {
    if (n.excluded) continue;
    eligibleBaseScore += calcNoteScore(getAppeal(team, n.attribute, assist), n);
  }
  // 縮小基準スコアはアシスト剥離後を使う (spec §6-5 BN22 / B6)
  const shrinkBase = assist ? Math.floor(eligibleBaseScore / 1.2) : eligibleBaseScore;
  return Math.floor(shrinkBase * (skill.rate - 1.0) * coverageRate);
}

/**
 * 単一カードのスキル最大発動数（理論上の上限発動回数）。
 * - タイマー（スコアアップ / 判定縮小）: floor( songDuration / count )
 * - ノート型スコアアップ: floor( notesCount / count )
 * - ノート型判定縮小: floor( (notesCount − excludedCount) / count )
 *   — 実シミュレーションは excluded ノーツでカウンタを進めないため分母を揃える (ADR 0036)
 * 発動確率 per は考慮せず、カウント条件を満たし得る最大回数を返す。
 */
export function calcCardSkillMaxActivations(
  team: ComputedTeam,
  notesCount: number,
  slotIndex: number,
  excludedCount: number = 0,
): number {
  const dc = team.cards.find(c => c.slotIndex === slotIndex);
  if (!dc || !dc.skill || dc.skill.count <= 0) return 0;
  const skill = dc.skill;
  if (skill.isShrink) {
    return calcShrinkActivationCount(skill, team, notesCount, excludedCount);
  }
  const denom = skill.isTimer ? team.songDuration : notesCount;
  if (denom <= 0) return 0;
  return Math.floor(denom / skill.count);
}

/**
 * 単一カードのスキル論理最高値（100% 発動・当該カードのみが縮小スキルを持つ想定）。
 * H38(B12=TRUE)/H40(B15=TRUE) の按分式と同形（単一カードのため按分は不要。B8）。
 */
export function calcCardSkillMax(
  team: ComputedTeam,
  notes: FlatNote[],
  notesCount: number,
  slotIndex: number,
  options?: ScoreOptions,
): number {
  const dc = team.cards.find(c => c.slotIndex === slotIndex);
  if (!dc || !dc.skill || dc.skill.count <= 0) return 0;
  const skill = dc.skill;
  const assist = options?.scoreUpAssist ?? false;

  if (!skill.isShrink) {
    const denom = skill.isTimer ? team.songDuration : notesCount;
    if (denom <= 0) return 0;
    return Math.floor((denom / skill.count) * skill.value);
  }

  const excludedCount = notes.filter(n => n.excluded).length;
  const effectiveSeconds = team.songDuration - shrinkHeadSeconds(team.songDuration, notesCount, excludedCount);
  if (effectiveSeconds <= 0) return 0;
  const sec = shrinkCoverageSeconds(skill, team, notesCount, excludedCount, true);
  if (sec <= 0) return 0;
  // 単一カードなので按分不要。飽和(sec >= effectiveSeconds)時は 100% キャップされる点は
  // H40 の Σ secᵢ/totalSec 飽和式と一致 (secᵢ=totalSec のため ratio=1)
  const ratio = Math.min(sec, effectiveSeconds) / effectiveSeconds;

  let eligibleBaseScore = 0;
  for (const n of notes) {
    if (n.excluded) continue;
    eligibleBaseScore += calcNoteScore(getAppeal(team, n.attribute, assist), n);
  }
  // 縮小基準スコアはアシスト剥離後を使う (spec §6-5 BN22 / B6)
  const shrinkBase = assist ? Math.floor(eligibleBaseScore / 1.2) : eligibleBaseScore;
  return Math.floor(shrinkBase * ratio * (skill.rate - 1.0));
}

interface RunOnceResult {
  score: number;
  activations: number[];
  contributions: number[];
  shrinkScore: number;
  scoreUpScore: number;
}

/** MC 1回分の実行 */
function runOnce(team: ComputedTeam, notes: FlatNote[], rng: Sfc32, options?: ScoreOptions): RunOnceResult {
  const N = notes.length;
  const cardCount = team.cards.length;
  const activations = new Array<number>(cardCount).fill(0);
  const contributions = new Array<number>(cardCount).fill(0);
  let shrinkScore = 0;
  let scoreUpScore = 0;
  const assist = options?.scoreUpAssist ?? false;

  // 期待縮小時間 (§2-2 按分用): 試行間で変わらない固定係数
  const excludedCount = notes.reduce((acc, n) => acc + (n.excluded ? 1 : 0), 0);
  const eligibleCount = Math.max(0, N - excludedCount);
  const expectedShrinkTimes = new Array<number>(cardCount).fill(0);
  let totalExpectedShrinkTime = 0;
  for (let c = 0; c < cardCount; c++) {
    const s = team.cards[c].skill;
    if (!s?.isShrink || s.count <= 0) continue;
    const numAct = calcShrinkActivationCount(s, team, N, excludedCount);
    const expSec = numAct * s.value * (s.per / 100);
    expectedShrinkTimes[c] = expSec;
    totalExpectedShrinkTime += expSec;
  }

  // Phase 1: タイマー型スキル
  const timerBonus = new Array<number>(N).fill(0);
  const timerShrinkTriggers = Array.from(
    { length: N },
    (): { cardIndex: number; durationNotes: number; rate: number }[] => [],
  );
  for (let c = 0; c < cardCount; c++) {
    const skill = team.cards[c].skill;
    if (!skill || !skill.isTimer || skill.count <= 0) continue;

    const maxAct = Math.floor(team.songDuration / skill.count);
    const alwaysTrigger = skill.isShrink
      ? options?.maxShrinkCoverage === true
      : options?.maxScoreUpCoverage === true;
    for (let a = 1; a <= maxAct; a++) {
      if (alwaysTrigger || rng.next() * 100 < skill.per) {
        activations[c]++;
        const t = a * skill.count;
        const noteIndex = calcNoteIndexAtTime(t, team.songDuration, N);
        if (noteIndex >= 0 && skill.isShrink) {
          timerShrinkTriggers[noteIndex].push({
            cardIndex: c,
            durationNotes: shrinkDurationNotes(skill.value, team.songDuration, N),
            rate: skill.rate,
          });
        } else if (noteIndex >= 0) {
          timerBonus[noteIndex] += skill.value;
          contributions[c] += skill.value;
          scoreUpScore += skill.value;
        }
      }
    }
  }

  // Phase 2: ノート順処理（縮小はキューイング、§1-1）
  let totalScore = 0;
  const counters = new Array<number>(cardCount).fill(0);
  let activeShrink: ActiveShrink | null = null;
  const shrinkQueue: ShrinkQueueItem[] = [];

  for (let n = 0; n < N; n++) {
    const note = notes[n];
    let scoreUpSum = timerBonus[n];

    // Phase A: 終了した active 区間を順次ドレインし、queue の次を繋げる
    while (activeShrink && activeShrink.endNote <= n) {
      const next = shrinkQueue.shift();
      if (next) {
        activeShrink = {
          endNote: n + next.durationNotes,
          rate: next.rate,
          sourceCard: next.sourceCard,
        };
      } else {
        activeShrink = null;
      }
    }

    for (const trigger of timerShrinkTriggers[n]) {
      activeShrink = enqueueShrink(
        shrinkQueue,
        activeShrink,
        n,
        trigger.durationNotes,
        trigger.rate,
        trigger.cardIndex,
      );
    }

    // Phase B: 各カードのトリガー判定（確率ロール）
    for (let c = 0; c < cardCount; c++) {
      const skill = team.cards[c].skill;
      if (!skill || skill.isTimer) continue;
      if (skill.count <= 0) continue;

      // 判定縮小スキルは先頭除外ノート (note.excluded=true) では発動判定対象外（§2）
      if (skill.isShrink && note.excluded) continue;

      counters[c]++;
      if (counters[c] >= skill.count) {
        counters[c] = 0;
        const roll = rng.next() * 100;
        const alwaysTrigger = (skill.isShrink && options?.maxShrinkCoverage === true)
          || (!skill.isShrink && options?.maxScoreUpCoverage === true);
        if (alwaysTrigger || roll < skill.per) {
          activations[c]++;
          if (skill.isShrink) {
            const durationNotes = shrinkDurationNotes(skill.value, team.songDuration, N);
            activeShrink = enqueueShrink(shrinkQueue, activeShrink, n, durationNotes, skill.rate, c);
          } else {
            scoreUpSum += skill.value;
            contributions[c] += skill.value;
            scoreUpScore += skill.value;
          }
        }
      }
    }

    // Phase C: rate 適用（「いずれか発動中」判定・重ねがけなし、§1）
    const activeRate = (activeShrink && activeShrink.endNote > n) ? activeShrink.rate : 0;

    const noteScoreBase = calcNoteScore(getAppeal(team, note.attribute, assist), note);
    const shrinkExtra = (activeRate > 0 && !note.excluded)
      ? Math.floor(noteScoreBase * (activeRate - 1.0))
      : 0;

    totalScore += noteScoreBase + shrinkExtra + scoreUpSum;

    // 判定縮小スキルのスコア寄与を期待縮小時間比で按分 (§2-2 仕様)
    if (shrinkExtra > 0 && totalExpectedShrinkTime > 0) {
      for (let c = 0; c < cardCount; c++) {
        if (expectedShrinkTimes[c] > 0) {
          contributions[c] += shrinkExtra * (expectedShrinkTimes[c] / totalExpectedShrinkTime);
        }
      }
      shrinkScore += shrinkExtra;
    }
  }

  return { score: applyFinalBonus(totalScore, team, options), activations, contributions, shrinkScore, scoreUpScore };
}

/** MC シミュレーション実行（チャンク分割） */
export async function runSimulation(
  team: ComputedTeam,
  notes: FlatNote[],
  iterations: number,
  onProgress?: (pct: number) => void,
  seed?: number,
  options?: ScoreOptions,
): Promise<SimulationResult> {
  const minScore = calcMinScore(team, notes, options);
  const maxScore = calcMaxScore(team, notes, options);

  const rng = new Sfc32(seed ?? Date.now());
  const scores: number[] = [];
  const shrinkScores: number[] = [];
  const scoreUpScores: number[] = [];
  const cardCount = team.cards.length;
  const totalActivations = new Array<number>(cardCount).fill(0);
  const totalContributions = new Array<number>(cardCount).fill(0);

  for (let i = 0; i < iterations; i += MC_CHUNK_SIZE) {
    const end = Math.min(i + MC_CHUNK_SIZE, iterations);
    for (let j = i; j < end; j++) {
      const result = runOnce(team, notes, rng, options);
      scores.push(result.score);
      shrinkScores.push(result.shrinkScore);
      scoreUpScores.push(result.scoreUpScore);
      for (let c = 0; c < cardCount; c++) {
        totalActivations[c] += result.activations[c];
        totalContributions[c] += result.contributions[c];
      }
    }
    onProgress?.(end / iterations);
    await new Promise<void>(r => setTimeout(r, 0));
  }

  // 統計計算
  const sorted = [...scores].sort((a, b) => a - b);
  const sum = scores.reduce((a, b) => a + b, 0);
  const mean = sum / scores.length;
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const variance = scores.reduce((acc, s) => acc + (s - mean) ** 2, 0) / scores.length;
  const stddev = Math.sqrt(variance);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];

  // カードごとのスキル発動統計
  const cardStats: CardSkillStats[] = team.cards
    .filter(dc => dc.skill && dc.skill.skillType !== 'none')
    .map((dc) => {
      const c = team.cards.indexOf(dc);
      return {
        cardIndex: dc.slotIndex,
        cardname: dc.cardname,
        skillType: dc.skill!.originalType ?? (
          dc.skill!.skillType === 'timerScoreUp' ? SKILL_TYPE.SCOREUP_TIMER
          : dc.skill!.isShrink ? SKILL_TYPE.SHRINK
          : 'スコアアップ'
        ),
        avgActivations: totalActivations[c] / iterations,
        theoreticalRate: dc.skill!.per,
        avgScoreContribution: totalContributions[c] / iterations,
      };
    });

  return {
    minScore,
    maxScore,
    scores,
    mean: Math.round(mean),
    median: Math.round(median),
    stddev: Math.round(stddev),
    p90: Math.round(p90),
    mcMin: sorted[0],
    mcMax: sorted[sorted.length - 1],
    cardStats,
    shrinkScores,
    scoreUpScores,
  };
}
