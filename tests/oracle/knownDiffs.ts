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
      '複数の要因が合成: ' +
      '(a) 🔵意図的差異（ADR 0040）: 発動開始位置を「実際の衣装の最小発動回数」に合わせて先頭除外し、' +
      'カバー率分母(effectiveSeconds)・基準スコアの対象範囲もこの除外に合わせて調整する（現行実装が正）。' +
      '(b) ❌不一致（修正は別タスク）: 基準スコアにアシストが乗る（スプレッドシートはアシスト剥離 BN22=floor(BN21/1.2)）、' +
      '発動回数を floor(eligibleCount/count) で先取りする（スプレッドシートは小数保持）、' +
      '理論最大値はノート単位キューイングモデル（スプレッドシートは按分近似式）。' +
      '(c) ⚠️ADR 0036 由来の意図的変更: 期待値を複数スキルの rate 加重平均で算出し、' +
      '構造的到達可能秒数キャップ・期待値≤理論最大値クランプを追加（スプレッドシートに対応概念なし）。' +
      'docs/shrink-skill-spec.md・docs/adr/0036-expected-score-rate-weighting.md・docs/adr/0040-*・docs/spreadsheet-score-calc-diff.md §4',
  },
  // liveEnd/final は scoreUp/shrink 差分の波及で必然的にずれるため known-diff に含める
  {
    component: 'liveEnd',
    reason: 'scoreUp/shrink の既知差分が合算(attr + scoreUp + shrink)に波及。docs/spreadsheet-score-calc-diff.md §8',
  },
  {
    component: 'final',
    reason:
      'scoreUp/shrink の既知差分がバッジ適用後(floor(liveEnd × (1 + badgeRate/100)))に波及。' +
      'docs/spreadsheet-score-calc-diff.md §8',
  },
  // 注: attr は意図的に KNOWN_DIFFS に含めない。
  // 属性値は engine とスプレッドシートで一致するはず（センター/フレンド/特効/丸めの設計が同一）であり、
  // ここが unexpected になることは engine 側の回帰を意味する（回帰ガードの要）。
  //
  // ただし v1.0.7 実装比較調査（docs/spreadsheet-score-calc-diff.md §0-2）で、golden fixture が
  // 現状カバーしていない条件（未特訓カード・非UR センター/フレンド・ラビットノート登録済み・固有ブローチの
  // 種類6/7が異なるカードに重複するデッキ等）では attr が実際にはスプレッドシートと不一致になる
  // 実装バグ候補（特訓ペナルティのハードコード・ラビットノートの特効倍率混入等）が複数確認されている。
  // これらは golden ケースの追加時に attr が unexpected 化する形で顕在化する想定であり、
  // 発生した際は本コメントの通り「回帰」ではなく「既知のバグ候補が検出された」ことを意味する。
  // 詳細は docs/spreadsheet-score-calc-diff.md §0-2 の❌一覧を参照。
];

export function classify(
  component: KnownDiff['component'],
  oracle: number,
  engine: number,
): 'match' | 'known-diff' | 'unexpected' {
  if (oracle === engine) return 'match';
  return KNOWN_DIFFS.some((k) => k.component === component) ? 'known-diff' : 'unexpected';
}
