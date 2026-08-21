/**
 * トップページのモーション本体 (ADR 0054)。
 *
 * GSAP を import するのはこのファイルだけ。実ブラウザと GSAP に依存するため
 * カバレッジ計測から除外し、検証は E2E (tests/home-motion.test.ts) で行う。
 * 判定ロジックは countUp.ts / homeMotionDom.ts に置き、ここは薄く保つこと。
 */
import { gsap } from 'gsap';
import { interpolateCount, parseCountTarget } from './countUp';
import {
  COUNT_TARGET_ATTR,
  WATCHDOG_MS,
  applyCount,
  collectGroup,
  collectRevealGroups,
  countTargetsIn,
  disableMotion,
  isMotionEnabled,
  observeRevealGroups,
  pendingIslandCount,
  releaseGroup,
  releaseTimelineGroups,
  revealTo,
  type RevealController,
  type RevealGroup,
} from './homeMotionDom';

/* v8 ignore start -- GSAP ブートストラップ (実ブラウザ専用、node/jsdom 単体テスト不可。E2E で検証) */

/** カウントアップの再生時間 (秒) */
const COUNT_DURATION = 0.8;

/** 対象が空のまま GSAP へ渡すと "target not found" 警告が出るため弾く */
function hasTargets(elements: readonly HTMLElement[]): boolean {
  return elements.length > 0;
}

/** 対象要素の中の data-count-to をすべてカウントアップさせる */
function countUpIn(elements: HTMLElement[]): void {
  for (const el of countTargetsIn(elements)) {
    const to = parseCountTarget(el.getAttribute(COUNT_TARGET_ATTR));
    if (to === null) continue;
    const state = { progress: 0 };
    gsap.to(state, {
      progress: 1,
      duration: COUNT_DURATION,
      ease: 'power2.out',
      onUpdate: () => applyCount(el, interpolateCount(0, to, state.progress)),
      onComplete: () => applyCount(el, to),
    });
  }
}

/** スクロールで画面に入ったグループを再生し、完了後にカウントアップへ繋ぐ */
function revealGroup(group: RevealGroup): void {
  if (!hasTargets(group.elements)) return;
  gsap.fromTo(group.elements, group.spec.from, {
    ...revealTo(group.spec),
    duration: group.spec.duration,
    stagger: group.spec.stagger,
    ease: 'power2.out',
    onComplete: () => {
      releaseGroup(group.elements);
      countUpIn(group.elements);
    },
  });
}

/**
 * IntersectionObserver が拾えない飛び越しスクロールへの保険。
 * rAF で 1 フレーム 1 回に間引き、全グループを消化したらリスナーごと外す。
 */
function attachScrollSweep(controller: RevealController): void {
  let queued = false;
  const onScroll = (): void => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      controller.sweep(window.innerHeight);
      if (controller.pending() === 0) window.removeEventListener('scroll', onScroll);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
}

/**
 * client:load の Astro 島 (CharacterColorHero / EventCountdown) がハイドレートを終えるまで待つ。
 *
 * 島がハイドレートすると Svelte が DOM ノードを差し替えるため、その前に GSAP が掴んだ要素は
 * 切り離された古いノードになる。すると生きている側は data-motion-item と opacity:0 を
 * 抱えたまま取り残され、本番ビルドでヒーローが永久に消える (実測で発生済み)。
 * astro-island は ハイドレート完了時に ssr 属性を外すので、それが尽きるまで待つ。
 */
function whenIslandsReady(start: () => void): void {
  if (pendingIslandCount(document) === 0) {
    start();
    return;
  }
  let done = false;
  const run = (): void => {
    if (done) return;
    done = true;
    observer.disconnect();
    window.clearTimeout(fallback);
    start();
  };
  const observer = new MutationObserver(() => {
    if (pendingIslandCount(document) === 0) run();
  });
  observer.observe(document.body, { subtree: true, attributes: true, attributeFilter: ['ssr'] });
  // 島のハイドレートが失敗しても、いつまでも隠したままにはしない
  const fallback = window.setTimeout(run, WATCHDOG_MS);
}

/** トップページのモーションを開始する。index.astro の <script> から 1 回だけ呼ぶ */
export function initHomeMotion(): void {
  const root = document.documentElement;
  if (!isMotionEnabled(root)) return;
  whenIslandsReady(() => startHomeMotion(root));
}

function startHomeMotion(root: HTMLElement): void {
  // タイムライン構築中に例外が出ても要素が隠れたままにならないようにする保険
  const watchdog = window.setTimeout(() => disableMotion(root), WATCHDOG_MS);
  // 何が起きても初回タイムライン分は必ず可視へ戻す最終フェイルセーフ (ADR 0054)
  window.setTimeout(() => releaseTimelineGroups(document), WATCHDOG_MS);

  try {
    const heroText = collectGroup(document, 'hero-text');
    const heroBar = collectGroup(document, 'hero-bar');
    const heroUnit = collectGroup(document, 'hero-unit');
    const statChip = collectGroup(document, 'stat-chip');

    const tl = gsap.timeline({ defaults: { ease: 'power2.out' } });

    if (hasTargets(heroText)) tl.fromTo(heroText,
      { opacity: 0, y: 12 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, onComplete: () => releaseGroup(heroText) },
      0);

    // 16 色バーが左から順に立ち上がるのがこの演出の主役 (ADR 0047 のアイデンティティ)。
    // opacity はフェードさせず 1 のまま scaleY だけを伸ばす。近黒のヒーロー背景の上で
    // opacity を上げると、キャラ色が背景に溶けて「暗い矩形」に見えてしまうため。
    // scaleY: 0 から始めれば出番が来るまで見えず、順に色が点灯するように立ち上がる。
    if (hasTargets(heroBar)) tl.fromTo(heroBar,
      { opacity: 1, scaleY: 0 },
      { opacity: 1, scaleY: 1, transformOrigin: 'bottom', duration: 0.4, stagger: 0.025, onComplete: () => releaseGroup(heroBar) },
      0.12);

    if (hasTargets(heroUnit)) tl.fromTo(heroUnit,
      { opacity: 0 },
      { opacity: 1, duration: 0.3, onComplete: () => releaseGroup(heroUnit) },
      0.45);

    if (hasTargets(statChip)) tl.fromTo(statChip,
      { opacity: 0, y: 8 },
      { opacity: 1, y: 0, duration: 0.4, stagger: 0.06, onComplete: () => releaseGroup(statChip) },
      0.5);

    tl.add(() => countUpIn(statChip), 0.55);

    const controller = observeRevealGroups(
      collectRevealGroups(document),
      (cb, options) => new IntersectionObserver(cb, options),
      revealGroup,
    );
    if (controller) attachScrollSweep(controller);

    window.clearTimeout(watchdog);
  } catch {
    window.clearTimeout(watchdog);
    disableMotion(root);
  }
}

/* v8 ignore stop */
