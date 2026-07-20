import { cubicOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

/**
 * ユーザーがモーション低減を要求しているか (prefers-reduced-motion: reduce)。
 * SSR (ビルド時) では false を返す。
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface MaterialOptions {
  /** イントロは 180ms / アウトロは 120ms 以下 (閉操作をブロックしないため。ADR 0046) */
  duration?: number;
  /** materialize の初期スケール */
  scaleFrom?: number;
  /** materialize の初期ぼかし量 (px) */
  blurFrom?: number;
}

/**
 * マテリアルが「現れる」トランジション。scale + fade + blur を同時に動かし、
 * 単なる opacity フェードではなく実体が到着する感覚を出す (ADR 0046)。
 * transform-origin は利用側の要素に付与してトリガーへアンカーする。
 * reduced-motion 時は短い cross-fade に退化する。
 */
export function materialIn(
  _node: Element,
  { duration = 180, scaleFrom = 0.94, blurFrom = 3 }: MaterialOptions = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 120, css: (t) => `opacity: ${t}` };
  }
  return {
    duration,
    easing: cubicOut,
    css: (t, u) => `
      opacity: ${t};
      transform: scale(${scaleFrom + (1 - scaleFrom) * t});
      filter: blur(${blurFrom * u}px);
    `,
  };
}

/**
 * マテリアルが「去る」トランジション。閉操作を待たせないよう既定 120ms。
 */
export function materialOut(
  _node: Element,
  { duration = 120, scaleFrom = 0.96 }: MaterialOptions = {},
): TransitionConfig {
  if (prefersReducedMotion()) {
    return { duration: 100, css: (t) => `opacity: ${t}` };
  }
  return {
    duration,
    easing: cubicOut,
    css: (t) => `
      opacity: ${t};
      transform: scale(${scaleFrom + (1 - scaleFrom) * t});
    `,
  };
}
