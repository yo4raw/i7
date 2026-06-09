import type { Card } from '../../src/lib/data/fetchCardsJson';

export type OracleMode = 'expected' | 'max';

export interface OracleInput {
  deck: (Card | null)[];          // スロット順（index0=1枚目 … index5=6枚目）
  center: number;                 // センター枠 index
  friend: number;                 // フレンド枠 index
  song: { notes: number; duration: number; noteStages: NoteStage[] };
  trained: boolean[];
  skillLevels: (1 | 2 | 3 | 4 | 5)[];
  broachAttr: { shout: number; beat: number; melody: number };
  rabbitAttr: { shout: number; beat: number; melody: number };
  badgeRate: number;              // % 例: 16
  assist: boolean;
}

/** 楽曲のステージ別ノート分布（属性×ライト倍率） */
export interface NoteStage {
  attribute: 'Shout' | 'Beat' | 'Melody';
  light: number;     // ライト倍率（1.0/1.1/1.2/1.3/1.5/2.6/3.0）
  count: number;     // そのステージの該当ノート数
}

export interface OracleResult {
  attr: number;
  scoreUp: number;
  shrink: number;
  liveEnd: number;
  final: number;
}
