// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  MOTION_FLAG_ATTR,
  MOTION_ITEM_ATTR,
  REVEAL_SPECS,
  REVEAL_GROUP_KEYS,
  revealTo,
  isMotionEnabled,
  disableMotion,
  collectGroup,
  collectRevealGroups,
  releaseGroup,
  countTargetsIn,
  applyCount,
  observeRevealGroups,
  REVEAL_ROOT_MARGIN,
  shouldReveal,
} from '../../../src/lib/motion/homeMotionDom';
import type { RevealGroup } from '../../../src/lib/motion/homeMotionDom';

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  host.innerHTML = html;
  document.body.append(host);
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.removeAttribute(MOTION_FLAG_ATTR);
});

describe('REVEAL_SPECS / revealTo', () => {
  it('REVEAL_GROUP_KEYS は REVEAL_SPECS のキーと一致する', () => {
    expect([...REVEAL_GROUP_KEYS].toSorted()).toEqual(Object.keys(REVEAL_SPECS).toSorted());
  });

  it('from に y があれば to に y:0 を、scale があれば scale:1 を含める', () => {
    expect(revealTo({ from: { opacity: 0, y: 16 }, duration: 0.5, stagger: 0.08 }))
      .toEqual({ opacity: 1, y: 0 });
    expect(revealTo({ from: { opacity: 0, scale: 0.9 }, duration: 0.4, stagger: 0.04 }))
      .toEqual({ opacity: 1, scale: 1 });
    expect(revealTo({ from: { opacity: 0 }, duration: 0.3, stagger: 0 }))
      .toEqual({ opacity: 1 });
  });
});

describe('isMotionEnabled / disableMotion', () => {
  it('フラグが on のときだけ true', () => {
    expect(isMotionEnabled(document.documentElement)).toBe(false);
    document.documentElement.setAttribute(MOTION_FLAG_ATTR, 'on');
    expect(isMotionEnabled(document.documentElement)).toBe(true);
    document.documentElement.setAttribute(MOTION_FLAG_ATTR, 'off');
    expect(isMotionEnabled(document.documentElement)).toBe(false);
  });

  it('disableMotion はフラグを外す', () => {
    document.documentElement.setAttribute(MOTION_FLAG_ATTR, 'on');
    disableMotion(document.documentElement);
    expect(document.documentElement.hasAttribute(MOTION_FLAG_ATTR)).toBe(false);
  });
});

describe('collectGroup', () => {
  it('指定キーの要素を DOM 順で集める', () => {
    const host = mount(`
      <a data-motion-group="hero-bar" id="a"></a>
      <a data-motion-group="other" id="x"></a>
      <a data-motion-group="hero-bar" id="b"></a>
    `);
    expect(collectGroup(host, 'hero-bar').map((el) => el.id)).toEqual(['a', 'b']);
  });

  it('該当なしなら空配列', () => {
    expect(collectGroup(mount('<p></p>'), 'hero-bar')).toEqual([]);
  });
});

describe('collectRevealGroups', () => {
  it('要素が存在するグループだけを spec 付きで返す', () => {
    const host = mount(`
      <li data-motion-group="event-item" id="e1"></li>
      <li data-motion-group="event-item" id="e2"></li>
      <span data-motion-group="rarity-chip" id="r1"></span>
    `);
    const groups = collectRevealGroups(host);
    expect(groups.map((g) => g.key).toSorted()).toEqual(['event-item', 'rarity-chip']);
    const eventGroup = groups.find((g) => g.key === 'event-item')!;
    expect(eventGroup.elements.map((el) => el.id)).toEqual(['e1', 'e2']);
    expect(eventGroup.spec).toBe(REVEAL_SPECS['event-item']);
  });

  it('ヒーローなど初回タイムライン側のキーは含めない', () => {
    const host = mount('<h1 data-motion-group="hero-text"></h1>');
    expect(collectRevealGroups(host)).toEqual([]);
  });
});

describe('releaseGroup', () => {
  it('data-motion-item を全要素から外す', () => {
    const host = mount('<a data-motion-item id="a"></a><a data-motion-item id="b"></a>');
    const els = [...host.querySelectorAll('a')];
    releaseGroup(els);
    expect(els.every((el) => !el.hasAttribute(MOTION_ITEM_ATTR))).toBe(true);
  });

  it('空配列でも例外にならない', () => {
    expect(() => releaseGroup([])).not.toThrow();
  });
});

describe('countTargetsIn', () => {
  it('自身と子孫の data-count-to を集める', () => {
    const host = mount(`
      <a id="chip"><span data-count-to="2689" id="n1"></span></a>
      <span data-count-to="12" id="n2"></span>
    `);
    const roots = [host.querySelector<HTMLElement>('#chip')!, host.querySelector<HTMLElement>('#n2')!];
    expect(countTargetsIn(roots).map((el) => el.id)).toEqual(['n1', 'n2']);
  });

  it('対象が無ければ空配列', () => {
    const host = mount('<a id="chip"></a>');
    expect(countTargetsIn([host.querySelector<HTMLElement>('#chip')!])).toEqual([]);
  });
});

describe('applyCount', () => {
  it('整形した文字列を textContent に書く', () => {
    const host = mount('<span data-count-to="2689">0</span>');
    const el = host.querySelector('span')!;
    applyCount(el, 1234.7);
    expect(el.textContent).toBe('1,235');
  });
});

/** jsdom には IntersectionObserver が無いので、コールバックを手動で発火できる偽物を使う */
class FakeObserver {
  observed: Element[] = [];
  unobserved: Element[] = [];
  disconnected = false;
  constructor(readonly cb: IntersectionObserverCallback, readonly options: IntersectionObserverInit) {}
  observe(el: Element) { this.observed.push(el); }
  unobserve(el: Element) { this.unobserved.push(el); }
  disconnect() { this.disconnected = true; }
  /** bottom を負にすると「スクロールで画面上方へ抜けた要素」を再現できる */
  fire(el: Element, isIntersecting: boolean, bottom = 100, rootBounds: { height: number } | null = null) {
    this.cb(
      [{ target: el, isIntersecting, boundingClientRect: { bottom }, rootBounds } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

function makeGroup(key: string, ids: string[], rectTop = 10_000): { group: RevealGroup; els: HTMLElement[] } {
  const host = mount(ids.map((id) => `<div data-motion-group="${key}" id="${id}"></div>`).join(''));
  const els = collectGroup(host, key);
  // jsdom は常に全ゼロの rect を返すため、スクロール位置を明示的に差し替える
  for (const el of els) el.getBoundingClientRect = () => ({ top: rectTop, bottom: rectTop + 50 }) as DOMRect;
  return { group: { key, spec: REVEAL_SPECS[key], elements: els }, els };
}

describe('observeRevealGroups', () => {
  it('各グループの先頭要素だけを観測し、rootMargin を渡す', () => {
    const a = makeGroup('event-item', ['e1', 'e2']);
    const b = makeGroup('rarity-chip', ['r1']);
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group, b.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      () => {},
    );
    expect(created!.observed.map((el) => el.id)).toEqual(['e1', 'r1']);
    expect(created!.options.rootMargin).toBe(REVEAL_ROOT_MARGIN);
  });

  it('交差したグループだけ onReveal を呼び、その要素の観測をやめる', () => {
    const a = makeGroup('event-item', ['e1']);
    const b = makeGroup('rarity-chip', ['r1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group, b.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], true);
    expect(revealed).toEqual(['event-item']);
    expect(created!.unobserved.map((el) => el.id)).toEqual(['e1']);
    expect(created!.disconnected).toBe(false);
  });

  it('画面上方へ抜けた要素 (bottom <= 0) も再生する', () => {
    // 最下部へ一気にスクロールした場合、対象は交差せず画面より上に居る。
    // ここを拾わないと data-motion-item が残り続けて要素が永久に隠れる。
    const a = makeGroup('event-item', ['e1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], false, -10);
    expect(revealed).toEqual(['event-item']);
    expect(created!.disconnected).toBe(true);
  });

  it('交差しておらず画面下に居るエントリは無視する', () => {
    const a = makeGroup('event-item', ['e1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], false, 800);
    expect(revealed).toEqual([]);
    expect(created!.disconnected).toBe(false);
  });

  it('同じ要素が二度発火しても onReveal は一度だけ', () => {
    const a = makeGroup('event-item', ['e1']);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(a.els[0], true);
    created!.fire(a.els[0], true);
    expect(revealed).toEqual(['event-item']);
  });

  it('全グループが再生されたら disconnect する', () => {
    const a = makeGroup('event-item', ['e1']);
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [a.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      () => {},
    );
    created!.fire(a.els[0], true);
    expect(created!.disconnected).toBe(true);
  });

  it('グループが空なら観測子を作らず null を返す', () => {
    let calls = 0;
    const result = observeRevealGroups([], () => { calls += 1; return null as unknown as IntersectionObserver; }, () => {});
    expect(result).toBeNull();
    expect(calls).toBe(0);
  });

  it('pending() は未再生グループ数を返す', () => {
    const a = makeGroup('event-item', ['e1']);
    const b = makeGroup('rarity-chip', ['r1']);
    let created: FakeObserver | null = null;
    const ctrl = observeRevealGroups(
      [a.group, b.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      () => {},
    )!;
    expect(ctrl.pending()).toBe(2);
    created!.fire(a.els[0], true);
    expect(ctrl.pending()).toBe(1);
  });

  it('sweep() は閾値を越えたグループだけを再生する', () => {
    // 画面 900px に対し 85% ライン = 765px。上端 700px は越えており、2000px は未達
    const near = makeGroup('event-item', ['e1'], 700);
    const far = makeGroup('rarity-chip', ['r1'], 2000);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    const ctrl = observeRevealGroups(
      [near.group, far.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    )!;
    ctrl.sweep(900);
    expect(revealed).toEqual(['event-item']);
    expect(created!.unobserved.map((el) => el.id)).toEqual(['e1']);
    expect(ctrl.pending()).toBe(1);
  });

  it('コールバック時に rootBounds があれば、交差しなかったグループも拾い直す', () => {
    // 最下部へ一気にスクロールした場合、飛び越された feature-2 には
    // コールバックが来ない。text-section の交差を契機に拾い直せること。
    const jumped = makeGroup('feature-2', ['f1'], -500);
    const entered = makeGroup('text-section', ['t1'], 100);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [jumped.group, entered.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(entered.els[0], true, 100, { height: 900 });
    expect(revealed.toSorted()).toEqual(['feature-2', 'text-section']);
    expect(created!.disconnected).toBe(true);
  });

  it('rootBounds が無ければコールバック内の拾い直しは行わない', () => {
    const jumped = makeGroup('feature-2', ['f1'], -500);
    const entered = makeGroup('text-section', ['t1'], 100);
    const revealed: string[] = [];
    let created: FakeObserver | null = null;
    observeRevealGroups(
      [jumped.group, entered.group],
      (cb, options) => { created = new FakeObserver(cb, options); return created as unknown as IntersectionObserver; },
      (g) => revealed.push(g.key),
    );
    created!.fire(entered.els[0], true, 100, null);
    expect(revealed).toEqual(['text-section']);
    expect(created!.disconnected).toBe(false);
  });
});

describe('shouldReveal', () => {
  it('ビューポート高さの 85% ラインより上なら true', () => {
    expect(shouldReveal(764, 900)).toBe(true);
    expect(shouldReveal(765, 900)).toBe(false);
    expect(shouldReveal(-100, 900)).toBe(true);
  });
});
