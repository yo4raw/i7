import type { Card } from '../../src/lib/data/fetchCardsJson';

export type OracleMode = 'expected' | 'max';

export interface OracleInput {
  deck: (Card | null)[];          // スロット順（index0=1枚目 … index5=6枚目）
  center: number;                 // センター枠 index
  friend: number;                 // フレンド枠 index
  song: { notes: number; duration: number; noteStages: NoteStage[] };
  trained: boolean[];
  skillLevels: (1 | 2 | 3 | 4 | 5)[];
  /**
   * カード別イベント特効倍率（= 1 + 特効率）。スプレッドシート AM29 系
   * `ROUND(stat × (1 + AM28))` の `(1 + AM28)` に相当する。
   * 特効なし=1.0 / 銅(100%)=2.0 / 銀(120%)=2.2 / 金(140%)=2.4。
   */
  eventMultipliers: number[];
  broachAttr: { shout: number; beat: number; melody: number };
  rabbitAttr: { shout: number; beat: number; melody: number };
  badgeRate: number;              // % 例: 16
  assist: boolean;
}

/** 楽曲のステージ別ノート分布（属性×ライト倍率×白/色） */
export interface NoteStage {
  attribute: 'Shout' | 'Beat' | 'Melody';
  type: 'white' | 'color'; // NOTE_RATE 白 0.025 / 色 0.030 を区別
  light: number;     // ライト倍率（1.0/1.1/1.2/1.3/1.5/2.6/3.0）
  count: number;     // そのステージ×属性×白色の該当ノート数
}

export interface OracleResult {
  attr: number;
  scoreUp: number;
  shrink: number;
  liveEnd: number;
  final: number;
}
