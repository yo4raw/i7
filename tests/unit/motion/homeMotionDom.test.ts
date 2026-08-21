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
} from '../../../src/lib/motion/homeMotionDom';

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
