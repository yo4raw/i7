/**
 * トップページのモーション用 DOM ヘルパーと演出パラメータ (ADR 0054)。
 * GSAP には依存しない。判定ロジックはすべてここに置き、homeMotion.ts は薄く保つ。
 */
import { formatCount } from './countUp';

/** <html> に立つモーション有効フラグ。BaseLayout の <head> インラインスクリプトが付与する */
export const MOTION_FLAG_ATTR = 'data-motion';
/** 初期非表示の対象マーカー。トゥイーン完了時に外す */
export const MOTION_ITEM_ATTR = 'data-motion-item';
/** stagger をまとめる単位のキー */
export const MOTION_GROUP_ATTR = 'data-motion-group';
/** カウントアップの目標値 */
export const COUNT_TARGET_ATTR = 'data-count-to';

/** タイムラインが開始されないまま経過したらフラグを強制解除するまでの時間 (ms) */
export const WATCHDOG_MS = 2500;
/** 画面下から 15% 入った時点でスクロール登場を発火させる */
export const REVEAL_ROOT_MARGIN = '0px 0px -15% 0px';
/** REVEAL_ROOT_MARGIN と等価な閾値。rect ベースの拾い直しで使う */
export const REVEAL_VIEWPORT_RATIO = 0.85;

/**
 * 要素の上端がビューポートの 85% ラインより上にあるか。
 * REVEAL_ROOT_MARGIN と同じ判定を rect から行うためのもの。
 */
export function shouldReveal(rectTop: number, viewportHeight: number): boolean {
  return rectTop < viewportHeight * REVEAL_VIEWPORT_RATIO;
}

export interface RevealSpec {
  /** GSAP の fromTo に渡す開始値 */
  from: Record<string, number>;
  /** 1 要素あたりの再生時間 (秒) */
  duration: number;
  /** グループ内の遅延 (秒) */
  stagger: number;
}

/**
 * スクロール登場グループの演出パラメータ。
 * 初回タイムライン側 (hero-text / hero-bar / hero-unit / stat-chip) はここに含めない。
 */
export const REVEAL_SPECS: Record<string, RevealSpec> = {
  'event-item': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.08 },
  'feature-0': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.05 },
  'feature-1': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.05 },
  'feature-2': { from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.05 },
  'rarity-chip': { from: { opacity: 0, scale: 0.9 }, duration: 0.4, stagger: 0.04 },
  // テキストの塊は読み始めを妨げないよう stagger しない
  'text-section': { from: { opacity: 0, y: 12 }, duration: 0.5, stagger: 0 },
};

export const REVEAL_GROUP_KEYS: readonly string[] = Object.keys(REVEAL_SPECS);

/** 初回タイムラインで再生するグループ。スクロール登場とは別に強制解放の対象にする */
export const TIMELINE_GROUP_KEYS: readonly string[] = ['hero-text', 'hero-bar', 'hero-unit', 'stat-chip'];

/** ハイドレート待ちの Astro 島が残っているか (island が DOM を差し替える前に GSAP を当てないため) */
export function pendingIslandCount(scope: ParentNode): number {
  return scope.querySelectorAll('astro-island[ssr]').length;
}

/**
 * 初回タイムライン分の要素を無条件で解放する最終フェイルセーフ。
 * ADR 0054 の「動かないことはあっても見えないことは起きない」を守る最後の砦。
 * 正常系ではタイムラインが既に解放済みのため何もしない。
 */
export function releaseTimelineGroups(scope: ParentNode): void {
  for (const key of TIMELINE_GROUP_KEYS) releaseGroup(collectGroup(scope, key));
}

/** from に含まれるキーに対応する終了値だけを組み立てる */
export function revealTo(spec: RevealSpec): Record<string, number> {
  const to: Record<string, number> = { opacity: 1 };
  if ('y' in spec.from) to.y = 0;
  if ('scale' in spec.from) to.scale = 1;
  return to;
}

/** <html> のモーションフラグが立っているか */
export function isMotionEnabled(root: Element): boolean {
  return root.getAttribute(MOTION_FLAG_ATTR) === 'on';
}

/** フラグを外して、隠れている要素をすべて可視へ戻す (失敗時のフェイルセーフ) */
export function disableMotion(root: Element): void {
  root.removeAttribute(MOTION_FLAG_ATTR);
}

/** 指定キーの要素を DOM 順で集める。DOM 順がそのまま stagger 順になる */
export function collectGroup(scope: ParentNode, key: string): HTMLElement[] {
  return [...scope.querySelectorAll<HTMLElement>(`[${MOTION_GROUP_ATTR}="${key}"]`)];
}

export interface RevealGroup {
  key: string;
  spec: RevealSpec;
  elements: HTMLElement[];
}

/** スクロール登場の対象グループを、要素が 1 つ以上あるものだけ集める */
export function collectRevealGroups(scope: ParentNode): RevealGroup[] {
  const groups: RevealGroup[] = [];
  for (const key of REVEAL_GROUP_KEYS) {
    const elements = collectGroup(scope, key);
    if (elements.length > 0) groups.push({ key, spec: REVEAL_SPECS[key], elements });
  }
  return groups;
}

/** 再生済みの要素を初期非表示ルールの対象から永久に外す */
export function releaseGroup(elements: readonly Element[]): void {
  for (const el of elements) el.removeAttribute(MOTION_ITEM_ATTR);
}

/** 与えられた要素の自身と子孫から、カウントアップ対象を DOM 順で集める */
export function countTargetsIn(elements: readonly HTMLElement[]): HTMLElement[] {
  const found: HTMLElement[] = [];
  for (const el of elements) {
    if (el.hasAttribute(COUNT_TARGET_ATTR)) found.push(el);
    found.push(...el.querySelectorAll<HTMLElement>(`[${COUNT_TARGET_ATTR}]`));
  }
  return found;
}

/** カウントアップの途中値・最終値を要素へ書き込む */
export function applyCount(el: Element, value: number): void {
  el.textContent = formatCount(value);
}

/** IntersectionObserver の生成を注入するためのファクトリ (jsdom には実装が無いためテストで差し替える) */
export type ObserverFactory = (
  cb: IntersectionObserverCallback,
  options: IntersectionObserverInit,
) => IntersectionObserver;

export interface RevealController {
  /** 未再生グループのうち、閾値を越えているものを rect ベースで再生する */
  sweep: (viewportHeight: number) => void;
  /** 未再生グループ数 */
  pending: () => number;
}

/**
 * 各グループの先頭要素を観測し、画面に入った時点で onReveal を 1 回だけ呼ぶ。
 * 発火した要素は unobserve し、全グループを消化したら disconnect する。
 *
 * IntersectionObserver は「画面下」から「画面上」へ 1 フレームで飛び越えた要素に対して
 * コールバックを発火しない (isIntersecting が false のまま変化しないため)。最下部への
 * 一気なスクロール・リロード時のスクロール位置復元・アンカーリンクでこれが起きると
 * data-motion-item が残り続けて要素が永久に隠れる。そのため
 *   1. コールバックのたびに未再生グループ全体を rect ベースで拾い直す
 *   2. 呼び出し側がスクロール等から明示的に叩ける sweep() を返す
 * の二段で取りこぼしを防ぐ。
 */
export function observeRevealGroups(
  groups: RevealGroup[],
  createObserver: ObserverFactory,
  onReveal: (group: RevealGroup) => void,
): RevealController | null {
  if (groups.length === 0) return null;

  const pending = new Map<Element, RevealGroup>();
  for (const group of groups) pending.set(group.elements[0], group);

  let observer: IntersectionObserver | null = null;

  const consume = (target: Element): void => {
    const group = pending.get(target);
    if (!group) return;
    pending.delete(target);
    observer?.unobserve(target);
    onReveal(group);
    if (pending.size === 0) observer?.disconnect();
  };

  const sweep = (viewportHeight: number): void => {
    // consume() は反復中に自身のキーを消すが、Map のイテレータは削除済みを安全にスキップする
    for (const target of pending.keys()) {
      if (shouldReveal(target.getBoundingClientRect().top, viewportHeight)) consume(target);
    }
  };

  observer = createObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting || entry.boundingClientRect.bottom <= 0) consume(entry.target);
    }
    const viewportHeight = entries[0]?.rootBounds?.height ?? 0;
    if (viewportHeight > 0) sweep(viewportHeight);
  }, { rootMargin: REVEAL_ROOT_MARGIN });

  for (const target of pending.keys()) observer.observe(target);
  return { sweep, pending: () => pending.size };
}
