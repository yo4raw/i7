import golden from './spreadsheet-v1.0.6.json';

export interface GoldenComponents {
  attr: number;
  scoreUp: number;
  shrink: number;
  liveEnd: number;
  final: number;
}

export interface GoldenCase {
  label: string;
  version: string;
  deck: number[];
  center: number;
  friend: number;
  trained: boolean[];
  skillLevels: (1 | 2 | 3 | 4 | 5)[];
  broachs: number[];
  sharedBroachs: number[][];
  rabbitNotes: Record<string, unknown>;
  /** カード別イベント特効ランク（採取時の実入力）。省略時は全カード none 扱い。 */
  eventTiers?: ('none' | 'bronze' | 'silver' | 'gold')[];
  songId: number;
  notes: number;
  duration: number;
  badgeRate: number;
  assist: boolean;
  expected: GoldenComponents | null;
  max: GoldenComponents | null;
}

export const goldenCases: GoldenCase[] = golden as GoldenCase[];
