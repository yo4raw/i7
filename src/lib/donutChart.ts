/**
 * SVG ドーナツチャート生成ユーティリティ
 *
 * カード一覧・カード詳細・楽曲一覧・楽曲詳細で共用する。
 */

import { ATTR_HEX } from './constants';

export interface DonutSegment {
  value: number;
  color: string;
  label?: string;
}

export interface DonutChartOptions {
  /** チャートサイズの Tailwind クラス（デフォルト: 'w-10 h-10'） */
  sizeClass?: string;
  /** ストローク幅（デフォルト: 5） */
  strokeWidth?: number;
  /** SVG の title 属性に各セグメントのパーセントを表示するか */
  showTitle?: boolean;
  /** 中央に表示するテキスト行（上段: ラベル, 下段: 値） */
  centerText?: { label: string; value: string };
}

/**
 * 比率データからドーナツチャートの SVG 文字列を生成する。
 *
 * @param segments - 各セグメントの値と色
 * @param opts - 表示オプション
 * @returns SVG HTML 文字列。全セグメントが 0 の場合は '-' プレースホルダー。
 */
export function donutChartSvg(segments: DonutSegment[], opts: DonutChartOptions = {}): string {
  const {
    sizeClass = 'w-10 h-10',
    strokeWidth = 5,
    showTitle = false,
    centerText,
  } = opts;

  const total = segments.reduce((sum, s) => sum + s.value, 0);
  if (!total) return '<span class="text-gray-400 text-xs">-</span>';

  const r = 15.9155;
  const c = 2 * Math.PI * r;

  // 各セグメントの弧長とオフセットを計算
  let offset = 0;
  const arcs = segments.map(s => {
    const len = (s.value / total) * c;
    const arc = { len, gap: c - len, offset, color: s.color };
    offset -= len;
    return arc;
  });

  // パーセント計算（title 用）
  const pcts = segments.map(s => Math.round((s.value / total) * 100));

  const titleAttr = showTitle
    ? ` title="${segments.map((s, i) => `${s.label || ''}:${pcts[i]}%`).join(' ').trim()}"`
    : '';

  const circles = arcs.map(a =>
    `<circle cx="18" cy="18" r="${r}" fill="none" stroke="${a.color}" stroke-width="${strokeWidth}"
      stroke-dasharray="${a.len} ${a.gap}" stroke-dashoffset="${a.offset}" transform="rotate(-90 18 18)"/>`
  ).join('\n    ');

  const centerHtml = centerText
    ? `<text x="18" y="17" text-anchor="middle" class="fill-gray-500" font-size="3">${centerText.label}</text>
    <text x="18" y="21" text-anchor="middle" class="fill-gray-800 font-bold" font-size="4">${centerText.value}</text>`
    : '';

  return `<svg viewBox="0 0 36 36" class="${sizeClass}"${titleAttr}>
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}"/>
    ${circles}
    ${centerHtml}
  </svg>`;
}

/** Shout/Beat/Melody の 3 属性用のショートカット */
export function attrDonutSvg(
  shout: number, beat: number, melody: number,
  opts: DonutChartOptions = {}
): string {
  return donutChartSvg([
    { value: shout, color: ATTR_HEX.Shout, label: 'S' },
    { value: beat,  color: ATTR_HEX.Beat,  label: 'B' },
    { value: melody, color: ATTR_HEX.Melody, label: 'M' },
  ], { showTitle: true, ...opts });
}
