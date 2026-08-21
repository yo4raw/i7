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
