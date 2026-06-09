/**
 * ② オラクル(=スプレッドシート)と engine の出力差分の分類定義。
 *
 * `match`       … オラクルと engine が bit-exact 一致
 * `known-diff`  … 既知の設計差（仕様ドキュメントに根拠あり）。回帰ガード上は許容
 * `unexpected`  … 想定外の差分。テスト失敗とする
 *
 * このファイルは engine を import しない（オラクル側の独立性は保たないが、
 * 純粋な分類定義のみで engine 依存も持たない）。
 */

export interface KnownDiff {
  component: 'attr' | 'scoreUp' | 'shrink' | 'liveEnd' | 'final';
  reason: string;
}

export const KNOWN_DIFFS: KnownDiff[] = [
  {
    component: 'scoreUp',
    reason:
      '活動回数: engine=floor(denom/count) / スプレッドシート=小数保持。docs/spreadsheet-score-calc-diff.md §3',
  },
  {
    component: 'shrink',
    reason:
      '基準スコアのアシスト剥離/先頭除外なし/カバー率分母=全曲尺/rate加重平均。docs/shrink-skill-spec.md・docs/spreadsheet-score-calc-diff.md §5',
  },
  // liveEnd/final は scoreUp/shrink 差分の波及で必然的にずれるため known-diff に含める
  {
    component: 'liveEnd',
    reason: 'scoreUp/shrink の既知差分が合算(attr + scoreUp + shrink)に波及',
  },
  {
    component: 'final',
    reason: 'scoreUp/shrink の既知差分がバッジ適用後(floor(liveEnd × (1 + badgeRate/100)))に波及',
  },
  // 注: attr は意図的に KNOWN_DIFFS に含めない。
  // 属性値は engine とスプレッドシートで一致するはず（センター/フレンド/特効/丸めの設計が同一）であり、
  // ここが unexpected になることは engine 側の回帰を意味する（回帰ガードの要）。
];

export function classify(
  component: KnownDiff['component'],
  oracle: number,
  engine: number,
): 'match' | 'known-diff' | 'unexpected' {
  if (oracle === engine) return 'match';
  return KNOWN_DIFFS.some((k) => k.component === component) ? 'known-diff' : 'unexpected';
}
