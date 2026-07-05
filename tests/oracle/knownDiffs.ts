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
    component: 'shrink',
    reason:
      'B6(アシスト剥離)/B7(floor位置)/B8(理論最大値の按分式化) は ADR 0041 で修正済み。残差は意図的差異のみ: ' +
      '(a) 発動開始位置の先頭除外とその帰結(カバー率分母/基準スコア範囲, ADR 0040) ' +
      '(b) rate加重の構造的到達可能秒数キャップと expected≤max クランプ (ADR 0036)。' +
      'docs/spreadsheet-score-calc-diff.md §4',
  },
  // liveEnd/final は shrink 差分の波及で必然的にずれるため known-diff に含める(scoreUp は bit-exact 化済み)
  {
    component: 'liveEnd',
    reason:
      'shrink の残差(I1 + ADR 0036 由来)が合算(attr + scoreUp + shrink)に波及。' +
      'docs/spreadsheet-score-calc-diff.md §8',
  },
  {
    component: 'final',
    reason:
      'shrink の残差(I1 + ADR 0036 由来)がバッジ適用後(floor(liveEnd × (1 + badgeRate/100)))に波及。' +
      'docs/spreadsheet-score-calc-diff.md §8',
  },
  // 注: attr は意図的に KNOWN_DIFFS に含めない。
  // 属性値は engine とスプレッドシートで一致するはず（センター/フレンド/特効/丸めの設計が同一）であり、
  // ここが unexpected になることは engine 側の回帰を意味する（回帰ガードの要）。
  //
  // B1(特訓ペナルティ=sp_time×sp_value)/B2(ラビットノートのキャラ単位化・フレンド除外・特効非乗算)/
  // B4(センター/フレンドボーナスの合算後1回丸め) は ADR 0041 で修正済み。
  // これにより、未特訓カード・非UR センター/フレンド・ラビットノート登録済み等の条件で golden fixture を
  // 追加しても attr は engine とスプレッドシートで一致するはずである。
  // したがって golden ケースの追加時に attr が unexpected 化した場合は、既知のバグ候補ではなく
  // engine 側の回帰を意味する。詳細は docs/spreadsheet-score-calc-diff.md §0-2 の B1〜B14 判定表を参照。
];

export function classify(
  component: KnownDiff['component'],
  oracle: number,
  engine: number,
): 'match' | 'known-diff' | 'unexpected' {
  if (oracle === engine) return 'match';
  return KNOWN_DIFFS.some((k) => k.component === component) ? 'known-diff' : 'unexpected';
}
