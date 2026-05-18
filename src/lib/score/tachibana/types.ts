import type { ComputedTeam } from '../types';
import type { Song } from '../../data/fetchSongsJson';

export interface TachibanaOptions {
  /** スコアアップフル発動: TRUE のとき確率係数を 1 として扱う */
  scoreUpFullActivation: boolean;
  /** スコアアップ確率UP: TRUE のとき確率に scoreUpProbabilityBoost%（既定 10）を加算 */
  scoreUpProbabilityBoost: boolean;
  /** scoreUpProbabilityBoost が TRUE のときに確率へ加算する値（％） */
  scoreUpProbabilityBoostValue: number;
  /** 縮小フル発動: TRUE のとき縮小スキルの確率を 1 として扱う */
  shrinkFullActivation: boolean;
  /** 20ノーツ加算なし（β）: TRUE のとき縮小スコアの上限を 20ノーツ分除外した属性値で算出 */
  excludeNotes20: boolean;
  /** SCOREUPバッジ倍率（％）。0 なら未使用 */
  scoreUpBadgeRate: number;
  /**
   * 縮小発動時間カバー率（縮小フル発動時に縮小スキルの累計発動時間が楽曲時間を超える割合）。
   * 1 以上で縮小フル発動 ON のとき、シート式と同じく per-card 重み付け正規化に切り替える。
   */
  shrinkCoverage: number;
  /** 特効が有効か（縮小スキルの「20ノーツなし」基準値計算用の判定に使う） */
  specialEffectActive: boolean;
}

export interface TachibanaCardBreakdown {
  slotIndex: number;
  cardName: string;
  attribute: 'Shout' | 'Beat' | 'Melody' | null;
  /** カード単位の属性値スコア（センター/フレンドスキル・特効・ブローチ反映後 × 楽曲属性係数） */
  attributeScore: number;
  /** カード単位のスコアアップスキル期待値（スキルが該当しなければ 0） */
  scoreUpScore: number;
  /** カード単位の縮小スキル期待値（スキルが該当しなければ 0） */
  shrinkScore: number;
  /** スキル種別表示文字列 */
  skillTypeLabel: string;
  /** スキル発動条件表示文字列 */
  skillReqLabel: string;
}

export interface TachibanaResult {
  /** 属性値スコア合計（D20 相当） */
  attributeScore: number;
  /** スコアアップスキル合計（D21 相当） */
  scoreUpScore: number;
  /** 縮小スキル合計（D22 相当） */
  shrinkScore: number;
  /** ライブ終了時スコア（D23 相当） */
  liveEndScore: number;
  /** 最終リザルト（D24 相当、SCOREUPバッジ適用後） */
  finalScore: number;
  /** カードごとの内訳（6 スロット分） */
  cards: TachibanaCardBreakdown[];
  /** 縮小発動時間カバー率（縮小フル発動時のオーバー検知用） */
  shrinkCoverage: number;
}

/** computeTachibanaResult への入力。`computeTeam` の出力をそのまま渡す。 */
export interface TachibanaInput {
  team: ComputedTeam;
  song: Song;
  options: TachibanaOptions;
}
