/**
 * カード一覧・所持カード一覧で共有するクライアントサイドレンダリングユーティリティ
 *
 * 使い方:
 *   import { initRenderer, renderTableRow, ... } from '../../lib/cardListRenderer';
 *   initRenderer({ base: '/i7/', thumbUrl: 'https://...' });
 */

import { RARITY_BADGE_CLASSES, ATTR_BADGE_BG, ATTR_BG, ATTR_BG_HOVER, ATTR_BORDER_COLOR } from './constants';
import { attrDonutSvg } from './donutChart';

// --- 設定 ---

let _base = '/i7/';
let _thumbUrl = '';

export function initRenderer(config: { base: string; thumbUrl: string }) {
  _base = config.base;
  _thumbUrl = config.thumbUrl;
}

// --- クライアントサイド Card 型 ---

export interface CardListItem {
  ID: number;
  cardID: number;
  cardname: string;
  name: string;
  rarity: string;
  attribute: string;
  shout_max: number;
  beat_max: number;
  melody_max: number;
  ap_skill_type: string | null;
  [key: string]: any;
}

// --- localStorage 所持数管理 ---

const STORAGE_KEY = 'i7_card_counts';

export function loadCounts(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function saveCounts(counts: Record<string, number>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(counts));
}

export function getCount(cardId: number): number {
  return loadCounts()[String(cardId)] || 0;
}

export function setCount(cardId: number, value: number) {
  const counts = loadCounts();
  const v = Math.max(0, value);
  if (v === 0) { delete counts[String(cardId)]; } else { counts[String(cardId)] = v; }
  saveCounts(counts);
}

// --- HTML 生成ユーティリティ ---

export function countControl(cardId: number): string {
  const count = getCount(cardId);
  return `<div class="flex items-center justify-center gap-1" onclick="event.stopPropagation()">
    <button data-count-btn="${cardId}" data-delta="-1"
      class="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-sm font-bold leading-none">−</button>
    <input type="number" data-count-input="${cardId}" value="${count}" min="0"
      class="w-10 h-6 text-center text-sm border border-gray-300 rounded [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" />
    <button data-count-btn="${cardId}" data-delta="1"
      class="w-6 h-6 rounded bg-gray-200 hover:bg-gray-300 text-sm font-bold leading-none">+</button>
  </div>`;
}

export function rarityBadge(r: string): string {
  return `<span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded ${RARITY_BADGE_CLASSES[r] || 'bg-gray-300'}">${r}</span>`;
}

export function attrBadge(a: string): string {
  return `<span class="inline-block px-1.5 py-0.5 text-xs font-bold text-white rounded ${ATTR_BADGE_BG[a] || 'bg-gray-300'}">${a || '?'}</span>`;
}

export function statsPct(s: number, b: number, m: number): { sPct: number; bPct: number; mPct: number } {
  const total = s + b + m;
  if (!total) return { sPct: 0, bPct: 0, mPct: 0 };
  return {
    sPct: Math.round((s / total) * 100),
    bPct: Math.round((b / total) * 100),
    mPct: Math.round((m / total) * 100),
  };
}

export function statsPie(s: number, b: number, m: number): string {
  return attrDonutSvg(s, b, m);
}

export function imgTag(cardID: number): string {
  return `<img src="${_thumbUrl}/${cardID}.png" alt="" class="w-12 h-auto rounded"
    onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 48 67%22><rect width=%2248%22 height=%2267%22 fill=%22%23e5e7eb%22/></svg>'" loading="lazy" />`;
}

// --- 行スタイル定数 ---

export const attrBg = ATTR_BG;
export const attrBgHover = ATTR_BG_HOVER;
export const attrBorderColor = ATTR_BORDER_COLOR;

export function rowBg(attrColor: string, thumbUrl: string): string {
  return `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.92) 60%, rgba(255,255,255,0.55)), linear-gradient(${attrColor || 'transparent'}, ${attrColor || 'transparent'}), url(${thumbUrl}) no-repeat right 25% / 50% auto`;
}

// --- カード行レンダリング ---

export interface RenderOptions {
  /** カード名クリックでフィルタする data-filter-cardname 属性を付与するか */
  enableNameFilter?: boolean;
}

export function renderTableRow(card: CardListItem, opts: RenderOptions = {}): string {
  const bg = attrBg[card.attribute] || 'transparent';
  const bgH = attrBgHover[card.attribute] || 'rgba(0,0,0,0.04)';
  const thumbUrl = `${_thumbUrl}/${card.ID}.png`;
  const defaultBg = rowBg(bg, thumbUrl);
  const hoverBg = rowBg(bgH, thumbUrl);
  const borderColor = attrBorderColor[card.attribute] || 'transparent';
  const pct = statsPct(card.shout_max || 0, card.beat_max || 0, card.melody_max || 0);

  const nameAttr = opts.enableNameFilter
    ? ` data-filter-cardname="${(card.cardname || '').replace(/"/g, '&quot;')}" onclick="event.stopPropagation()"`
    : '';

  return `<tr class="cursor-pointer" style="border-top:2px solid ${borderColor};background:${defaultBg}" onmouseenter="this.style.background='${hoverBg}'" onmouseleave="this.style.background='${defaultBg}'" onclick="location.href='${_base}cards/${card.ID}/'">
    <td class="px-3 py-2">${imgTag(card.ID)}</td>
    <td class="px-3 py-2">${card.ID}</td>
    <td class="px-3 py-2"${nameAttr}><span class="text-indigo-600 hover:underline cursor-pointer">${card.cardname || ''}</span></td>
    <td class="px-3 py-2">${card.name || ''}</td>
    <td class="px-3 py-2">${rarityBadge(card.rarity)}</td>
    <td class="px-3 py-2">${attrBadge(card.attribute)}</td>
    <td class="px-3 py-2">${statsPie(card.shout_max || 0, card.beat_max || 0, card.melody_max || 0)}</td>
    <td class="px-3 py-2 text-right">${(card.shout_max || 0).toLocaleString()}<div class="text-xs text-gray-400">${pct.sPct}%</div></td>
    <td class="px-3 py-2 text-right">${(card.beat_max || 0).toLocaleString()}<div class="text-xs text-gray-400">${pct.bPct}%</div></td>
    <td class="px-3 py-2 text-right">${(card.melody_max || 0).toLocaleString()}<div class="text-xs text-gray-400">${pct.mPct}%</div></td>
    <td class="px-3 py-2 text-xs">${card.ap_skill_type || ''}</td>
    <td class="px-3 py-2">${countControl(card.ID)}</td>
  </tr>`;
}

export function renderMobileCard(card: CardListItem, opts: RenderOptions = {}): string {
  const bg = attrBg[card.attribute] || 'transparent';
  const thumbUrl = `${_thumbUrl}/${card.ID}.png`;
  const mobileBg = `linear-gradient(to right, rgba(255,255,255,1) 40%, rgba(255,255,255,0.65)), linear-gradient(${bg}, ${bg}), url(${thumbUrl}) no-repeat right 25% / auto 500%`;
  const borderColor = attrBorderColor[card.attribute] || 'transparent';
  const pct = statsPct(card.shout_max || 0, card.beat_max || 0, card.melody_max || 0);

  const nameAttr = opts.enableNameFilter
    ? ` data-filter-cardname="${(card.cardname || '').replace(/"/g, '&quot;')}" onclick="event.stopPropagation()"`
    : '';

  return `<div class="rounded-lg shadow p-3 hover:shadow-md transition-shadow" style="border-top:3px solid ${borderColor};background:${mobileBg}">
    <div class="flex gap-3" onclick="location.href='${_base}cards/${card.ID}/'" style="cursor:pointer">
      <div class="flex-shrink-0">${imgTag(card.ID)}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-1 mb-1">${rarityBadge(card.rarity)} ${attrBadge(card.attribute)}</div>
        <p class="font-medium text-sm truncate"${nameAttr}><span class="text-indigo-600 hover:underline cursor-pointer">${card.cardname || ''}</span></p>
        <p class="text-xs text-gray-500">${card.name || ''}</p>
        <div class="flex items-center gap-2 mt-1">
          ${statsPie(card.shout_max || 0, card.beat_max || 0, card.melody_max || 0)}
          <div class="flex gap-2 text-xs">
            <span class="text-red-500">S:${card.shout_max || 0} <span class="text-gray-400">${pct.sPct}%</span></span>
            <span class="text-green-500">B:${card.beat_max || 0} <span class="text-gray-400">${pct.bPct}%</span></span>
            <span class="text-blue-500">M:${card.melody_max || 0} <span class="text-gray-400">${pct.mPct}%</span></span>
          </div>
        </div>
      </div>
    </div>
    <div class="mt-2 flex items-center justify-between border-t pt-2">
      <span class="text-xs text-gray-500">所持数</span>
      ${countControl(card.ID)}
    </div>
  </div>`;
}

// --- イベントバインド ---

/**
 * 所持数の +/- ボタンと入力欄のイベントを登録する。
 * @param onCountChange 所持数変更時のコールバック（cardId, newValue）
 */
export function bindCountEvents(onCountChange?: (cardId: number, newValue: number) => void) {
  document.querySelectorAll<HTMLButtonElement>('button[data-count-btn]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const cardId = Number(btn.dataset.countBtn);
      const delta = Number(btn.dataset.delta);
      const newVal = Math.max(0, getCount(cardId) + delta);
      setCount(cardId, newVal);
      document.querySelectorAll<HTMLInputElement>(`input[data-count-input="${cardId}"]`).forEach(inp => {
        inp.value = String(newVal);
      });
      onCountChange?.(cardId, newVal);
    });
  });
  document.querySelectorAll<HTMLInputElement>('input[data-count-input]').forEach(inp => {
    inp.addEventListener('change', (e) => {
      e.stopPropagation();
      const cardId = Number(inp.dataset.countInput);
      const val = Math.max(0, Number(inp.value) || 0);
      setCount(cardId, val);
      inp.value = String(val);
      onCountChange?.(cardId, val);
    });
    inp.addEventListener('click', (e) => e.stopPropagation());
  });
}
