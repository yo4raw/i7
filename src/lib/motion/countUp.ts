/**
 * トップページのカウントアップ演出で使う数値ユーティリティ (ADR 0054)。
 * DOM にも GSAP にも依存しない純粋関数だけを置く。
 */

/** カウントアップ表示用に、四捨五入して ja-JP のカンマ区切り整数文字列へ整形する */
export function formatCount(value: number): string {
  return Math.round(value).toLocaleString('ja-JP');
}

/** 進捗 (0..1、範囲外はクランプ) に応じて from → to を線形補間する */
export function interpolateCount(from: number, to: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return from + (to - from) * p;
}

/** data-count-to 属性の生値から目標値を読む。未設定・非有限なら null */
export function parseCountTarget(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
