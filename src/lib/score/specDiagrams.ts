/**
 * スコア計算仕様解説ページ (src/pages/score-calc/spec.astro) 用 SVG 生成ヘルパー。
 *
 * 既存の histogram.ts / donutChart.ts と同じく「インライン SVG 文字列を返す関数」
 * パターンで統一する。呼び出し側は `<Fragment set:html={...} />` または
 * `{@html ...}` で埋め込む。
 */

import { ATTR_HEX } from '../constants';
import { renderHistogramSvg } from './histogram';
import { XorShift128Plus } from './rng';

const COLOR = {
  main: '#6366f1',      // indigo-500（メイン枠）
  mainDark: '#4338ca',  // indigo-700（強調文字）
  shrink: '#f59e0b',    // amber-500（縮小枝）
  shrinkDark: '#b45309',// amber-700
  emerald: '#10b981',   // emerald-500（カバー率）
  exclude: '#d1d5db',   // gray-300（先頭除外領域）
  grid: '#e5e7eb',      // gray-200（目盛）
  text: '#374151',      // gray-700
  muted: '#6b7280',     // gray-500
} as const;

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 矢印マーカーの共通定義 (1 SVG につき defs 1回で良い) */
function arrowMarkerDef(id = 'arrow', color = COLOR.main): string {
  return `<defs>
    <marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />
    </marker>
  </defs>`;
}

/* ================================================================
 * (A) スコア計算の全体フロー図
 * ================================================================ */
export function overviewFlowSvg(): string {
  const W = 760, H = 520;
  // ボックス配置: 上3段 → 合計ノードに合流 → バッジ → 最終
  const boxes = [
    // Row 0 (y=20): 属性値 → アシスト → 素点 → ライト倍率
    { x: 20,  y: 20, w: 170, h: 64, title: 'チーム属性値', sub: 'Shout / Beat / Melody\nの 6 枠合算', c: COLOR.main },
    { x: 200, y: 20, w: 170, h: 64, title: 'アシスト適用', sub: 'floor(team × 1.2)', c: COLOR.main },
    { x: 380, y: 20, w: 170, h: 64, title: '1ノーツ素点', sub: 'floor(appeal × NOTE_RATE)\n白=2.5% / 色=3.0%', c: COLOR.main },
    { x: 560, y: 20, w: 180, h: 64, title: 'ライト倍率', sub: 'floor(素点 × LIGHT_MULTIPLIER)\n通常 1.0〜1.5 / サビ 3.0', c: COLOR.main },
    // Row 1 (y=120): スコアアップ加算 / 縮小加算 / (ライト倍率の続き)
    { x: 20,  y: 120, w: 170, h: 84, title: 'スコアアップ加算', sub: 'Σ scoreUpExpected\n(タイマー系含む)', c: COLOR.main },
    { x: 380, y: 120, w: 170, h: 84, title: '縮小加算 (§5)', sub: 'floor(eligibleBaseScore\n × (rate − 1.0)\n × coverageRate)', c: COLOR.shrink },
    // Row 2 (y=240): 合計 total
    { x: 120, y: 240, w: 520, h: 70, title: '合計 total', sub: 'Σ (noteScore + shrinkExtra + scoreUpSum)', c: COLOR.mainDark },
    // Row 3 (y=340): バッジ倍率
    { x: 240, y: 340, w: 280, h: 64, title: 'バッジ倍率適用', sub: 'floor(total × (1 + badge% / 100))', c: COLOR.main },
    // Row 4 (y=430): 最終スコア
    { x: 240, y: 430, w: 280, h: 64, title: '最終スコア', sub: '+ broachScoreBonus (種類9)', c: COLOR.mainDark },
  ];

  const boxSvg = boxes.map((b) => {
    const lines = b.sub.split('\n');
    const subText = lines.map((l, i) =>
      `<tspan x="${b.x + b.w / 2}" dy="${i === 0 ? 16 : 12}">${escapeXml(l)}</tspan>`
    ).join('');
    return `<g>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="8" ry="8"
            fill="white" stroke="${b.c}" stroke-width="2"/>
      <text x="${b.x + b.w / 2}" y="${b.y + 20}" text-anchor="middle"
            fill="${b.c}" font-size="13" font-weight="bold">${escapeXml(b.title)}</text>
      <text x="${b.x + b.w / 2}" y="${b.y + 34}" text-anchor="middle"
            fill="${COLOR.muted}" font-size="10">${subText}</text>
    </g>`;
  }).join('\n');

  const arrow = (x1: number, y1: number, x2: number, y2: number, color = COLOR.main, dashed = false) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="2"
           marker-end="url(#arrow)"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;
  const arrowShrink = (x1: number, y1: number, x2: number, y2: number, dashed = false) =>
    `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLOR.shrink}" stroke-width="2"
           marker-end="url(#arrow-shrink)"${dashed ? ' stroke-dasharray="4 3"' : ''}/>`;

  // 合計ノードの上辺中央
  const totalTopY = 240;
  const totalLeftX = 180;   // スコアアップ加算の真下付近
  const totalCenterX = 380; // 縮小加算の真下
  const totalRightX = 580;  // ライト倍率の真下付近

  const arrows = [
    // Row 0: 横方向の直列
    arrow(190, 52, 200, 52),   // 属性値 → アシスト
    arrow(370, 52, 380, 52),   // アシスト → 素点
    arrow(550, 52, 560, 52),   // 素点 → ライト倍率
    // ライト倍率（per-note 素点） → 縮小加算（縮小発動中のノートだけ (rate−1)×素点 を追加）
    arrowShrink(590, 84, 485, 120),
    // 縮小加算 → 合計
    arrow(465, 204, totalCenterX, totalTopY),
    // スコアアップ加算 → 合計 (左端、斜め↘)
    arrow(105, 204, totalLeftX, totalTopY),
    // ライト倍率 → 合計 (右端、斜め↙。ノーツ本体スコアの総計)
    arrow(680, 84, totalRightX, totalTopY),
    // 合計 → バッジ
    arrow(380, 310, 380, 340),
    // バッジ → 最終
    arrow(380, 404, 380, 430),
  ].join('\n');

  // 補助ラベル
  const auxLabels = `
    <text x="650" y="115" text-anchor="middle" fill="${COLOR.muted}" font-size="9">
      (各ノーツスコアを合算)
    </text>
    <text x="540" y="108" text-anchor="end" fill="${COLOR.shrinkDark}" font-size="9">
      橙経路 = 縮小発動中のノートだけ (rate−1)×素点 を追加
    </text>
  `;

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="スコア計算の全体フロー">
    ${arrowMarkerDef('arrow', COLOR.main)}
    <defs>
      <marker id="arrow-shrink" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
        <path d="M 0 0 L 10 5 L 0 10 z" fill="${COLOR.shrink}" />
      </marker>
    </defs>
    ${boxSvg}
    ${arrows}
    ${auxLabels}
    <text x="${W / 2}" y="${H - 6}" text-anchor="middle" fill="${COLOR.muted}" font-size="10">
      バッジ倍率は 合計 total（ノーツ本体 + 縮小加算 + スコアアップ加算）に対して適用される
    </text>
  </svg>`;
}

/* ================================================================
 * (B) 縮小スキルのタイムライン図
 * ================================================================ */
export interface Activation {
  start: number;    // ノート index (inclusive)
  end: number;      // ノート index (exclusive)
  fired: boolean;   // true=発動, false=不発
  cardIndex?: number; // どのカードのトリガーか（マルチカード時に使用）
}

export interface ShrinkCardParam {
  count: number;
  per: number;   // 発動確率 %
  value: number; // 持続秒
}

export interface ShrinkTimelineParams {
  /** 1 枚目のパラメータ（後方互換: 単体カード用） */
  count: number;
  per: number;
  value: number;
  /** マルチカード時はこちらを優先（未指定なら count/per/value で 1 枚構成） */
  cards?: ShrinkCardParam[];
  notesCount: number;
  songDuration: number;
  excludeHead?: number;
  activations?: Activation[];
}

/** 発動の抽選を決定論的に行う (seed 固定、縮小スキル 1 枚版) */
export function simulateActivationsDeterministic(p: {
  count: number; per: number; value: number;
  notesCount: number; songDuration: number;
  excludeHead: number; seed: number;
}): Activation[] {
  const rng = new XorShift128Plus(p.seed);
  const acts: Activation[] = [];
  const eligibleCount = Math.max(0, p.notesCount - p.excludeHead);
  const maxActivations = Math.floor(eligibleCount / p.count);
  const valueInNotes = Math.floor((p.value / p.songDuration) * p.notesCount);
  for (let k = 1; k <= maxActivations; k++) {
    const start = p.excludeHead + k * p.count;
    const end = Math.min(start + valueInNotes, p.notesCount);
    const fired = rng.next() * 100 < p.per;
    acts.push({ start, end, fired, cardIndex: 0 });
  }
  return acts;
}

/**
 * 複数枚の縮小スキルをキューイング仕様に従ってシミュレートする。
 * docs/shrink-skill-spec.md §1-1 に準拠:
 *  - 同時刻には重複発動しない
 *  - 発動中に他スキルのトリガーが来たら、先行スキル終了後に連続発動する
 *  - 曲全体を超えた分はキューから切り捨て
 */
export function simulateActivationsMulti(p: {
  cards: ShrinkCardParam[];
  notesCount: number;
  songDuration: number;
  excludeHead: number;
  seed: number;
}): Activation[] {
  if (p.cards.length === 0) return [];

  // Phase 1: 各カードのトリガーを生成（発動位置・発動可否・value_in_notes）
  type Trigger = {
    cardIndex: number;
    noteIndex: number;   // トリガーが発火するノート位置
    fired: boolean;
    valueInNotes: number;
  };
  const rng = new XorShift128Plus(p.seed);
  const eligibleCount = Math.max(0, p.notesCount - p.excludeHead);
  const triggers: Trigger[] = [];
  for (let i = 0; i < p.cards.length; i++) {
    const c = p.cards[i];
    const maxActivations = Math.floor(eligibleCount / c.count);
    const valueInNotes = Math.floor((c.value / p.songDuration) * p.notesCount);
    for (let k = 1; k <= maxActivations; k++) {
      const noteIndex = p.excludeHead + k * c.count;
      const fired = rng.next() * 100 < c.per;
      triggers.push({ cardIndex: i, noteIndex, fired, valueInNotes });
    }
  }

  // Phase 2: トリガーを時系列（noteIndex 昇順 → 同時なら cardIndex 昇順）に並べる
  triggers.sort((a, b) => a.noteIndex - b.noteIndex || a.cardIndex - b.cardIndex);

  // Phase 3: キューイングで発動区間を決定
  const acts: Activation[] = [];
  let currentEnd = 0; // 現在発動中スキルの end（ノート index）
  for (const t of triggers) {
    if (!t.fired) {
      // 不発はタイムライン表示のため情報を残す（fired=false）
      acts.push({ start: t.noteIndex, end: t.noteIndex, fired: false, cardIndex: t.cardIndex });
      continue;
    }
    // 発動中なら、その終了時刻まで待機してから開始（キューイング）
    const start = Math.max(t.noteIndex, currentEnd);
    if (start >= p.notesCount) {
      // キューから溢れて曲が終了した → 切り捨て
      continue;
    }
    const end = Math.min(start + t.valueInNotes, p.notesCount);
    acts.push({ start, end, fired: true, cardIndex: t.cardIndex });
    currentEnd = end;
  }
  return acts;
}

/** カード別の塗り色（1 枚目は既存の shrink 色、以降は濃度違いのオレンジ系） */
export const CARD_COLORS = ['#f59e0b', '#f97316', '#ea580c', '#c2410c', '#9a3412'] as const;

export function shrinkTimelineSvg(p: ShrinkTimelineParams): string {
  const cards: ShrinkCardParam[] = p.cards ?? [{ count: p.count, per: p.per, value: p.value }];
  const numCards = cards.length;

  // カード数が増えるとタイムラインの縦幅も増やす（コインレーン + サマリー行）
  const coinLaneH = 18;
  const barH = 26;
  const W = 820;
  const M = { top: 24, right: 20, bottom: 40, left: 20 };
  const innerH = coinLaneH * numCards + barH + 10;
  const H = M.top + innerH + M.bottom;
  const innerW = W - M.left - M.right;
  const excludeHead = p.excludeHead ?? 0;
  const activations = p.activations ?? [];

  const xScale = (noteIdx: number) => M.left + (noteIdx / p.notesCount) * innerW;

  // 先頭除外領域
  const excludeX1 = xScale(0);
  const excludeX2 = xScale(excludeHead);
  const excludeRect = excludeHead > 0
    ? `<rect x="${excludeX1}" y="${M.top}" width="${excludeX2 - excludeX1}" height="${innerH}"
              fill="${COLOR.exclude}" opacity="0.6"/>
       <text x="${(excludeX1 + excludeX2) / 2}" y="${M.top + 12}" text-anchor="middle"
             fill="${COLOR.muted}" font-size="10">先頭除外 ${excludeHead}ノート</text>`
    : '';

  // 発動判定コイン（カードごとに別レーンに配置）
  const coins: string[] = [];
  const gridLines: string[] = [];
  for (const a of activations) {
    const ci = a.cardIndex ?? 0;
    const x = xScale(a.start);
    const cy = M.top + 10 + ci * coinLaneH;
    if (a.fired || !a.fired) {
      // 判定位置を示す縦点線はカード 1 枚目のトリガー位置にのみ引く（視覚的に煩雑にならないよう）
      if (ci === 0) {
        gridLines.push(
          `<line x1="${x}" y1="${M.top}" x2="${x}" y2="${M.top + innerH}" stroke="${COLOR.grid}" stroke-width="1" stroke-dasharray="3 2"/>`
        );
      }
    }
    coins.push(
      `<circle cx="${x}" cy="${cy}" r="5"
               fill="${a.fired ? '#22c55e' : '#9ca3af'}" stroke="white" stroke-width="1.5">
         <title>カード${ci + 1}: ${a.fired ? '発動' : '不発'} (note=${a.start})</title>
       </circle>`
    );
  }

  // カードレーンのラベル（左端に 1 / 2 / 3 など）
  const laneLabels = cards.map((_, i) =>
    `<text x="${M.left - 4}" y="${M.top + 14 + i * coinLaneH}" text-anchor="end"
           fill="${CARD_COLORS[i]}" font-size="10" font-weight="bold">${i + 1}</text>`
  ).join('\n');

  // 発動区間（カードごとの色で下段バーに塗る）
  const barY = M.top + coinLaneH * numCards + 4;
  const fillBars = activations.filter((a) => a.fired).map((a) => {
    const ci = a.cardIndex ?? 0;
    const x1 = xScale(a.start);
    const x2 = xScale(a.end);
    return `<rect x="${x1}" y="${barY}" width="${x2 - x1}" height="${barH}"
                  fill="${CARD_COLORS[ci]}" opacity="0.85">
              <title>カード${ci + 1}: 発動区間 ${a.start}-${a.end}</title>
            </rect>`;
  }).join('\n');

  // 時間目盛 (10秒ごと)
  const secondsTicks: string[] = [];
  const tickInterval = 10;
  for (let s = 0; s <= p.songDuration; s += tickInterval) {
    const noteIdx = (s / p.songDuration) * p.notesCount;
    const x = xScale(noteIdx);
    secondsTicks.push(
      `<line x1="${x}" y1="${M.top + innerH}" x2="${x}" y2="${M.top + innerH + 4}" stroke="${COLOR.muted}" stroke-width="1"/>
       <text x="${x}" y="${M.top + innerH + 16}" text-anchor="middle" fill="${COLOR.muted}" font-size="9">${s}s</text>`
    );
  }

  // 発動サマリー: カードごとに発動/機会 + カバー時間
  const firedPerCard = cards.map((_, i) => activations.filter((a) => a.fired && a.cardIndex === i).length);
  const triggersPerCard = cards.map((_, i) => activations.filter((a) => a.cardIndex === i).length);
  const coverPerCard = cards.map((c, i) => firedPerCard[i] * c.value);
  const totalCoverRaw = coverPerCard.reduce((a, b) => a + b, 0);
  const totalCoverCapped = Math.min(totalCoverRaw, p.songDuration);
  const coverPct = ((totalCoverCapped / p.songDuration) * 100).toFixed(1);
  const summary = cards.map((c, i) =>
    `カード${i + 1} (${c.count}ノーツ/${c.per}%/${c.value}秒): ${firedPerCard[i]}/${triggersPerCard[i]}回 (${coverPerCard[i]}秒)`
  ).join(' ／ ');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="縮小スキルのタイムライン">
    <!-- 軸 -->
    <line x1="${M.left}" y1="${M.top + innerH}" x2="${M.left + innerW}" y2="${M.top + innerH}" stroke="${COLOR.muted}" stroke-width="1"/>
    ${excludeRect}
    ${gridLines.join('\n')}
    ${laneLabels}
    ${fillBars}
    ${coins.join('\n')}
    ${secondsTicks.join('\n')}
    <text x="${M.left}" y="${H - 6}" fill="${COLOR.text}" font-size="10">
      ${escapeXml(summary)} ／ 合計カバー ${totalCoverCapped}秒 (${coverPct}%)
    </text>
  </svg>`;
}

/* ================================================================
 * (C) 先頭除外ロジックの図
 * ================================================================ */
export interface ExcludeHeadParams {
  notes20: number;
  minCount: number;
  caseLabel?: string;
}

export function excludeHeadSvg(p: ExcludeHeadParams): string {
  const W = 640, H = 180;
  const M = { top: 30, right: 20, bottom: 30, left: 60 };
  const innerW = W - M.left - M.right;
  const maxRange = Math.max(p.notes20, p.minCount) * 1.4 + 5;
  const xScale = (n: number) => M.left + (n / maxRange) * innerW;

  const result = Math.max(p.notes20, p.minCount);
  const notes20X = xScale(p.notes20);
  const minCountX = xScale(p.minCount);
  const resultX = xScale(result);

  const lineNotes20 = `
    <line x1="${M.left}" y1="60" x2="${notes20X}" y2="60" stroke="${ATTR_HEX.Melody}" stroke-width="10" stroke-linecap="round"/>
    <text x="${M.left - 8}" y="64" text-anchor="end" fill="${COLOR.text}" font-size="11" font-weight="bold">notes_20</text>
    <text x="${notes20X + 6}" y="64" fill="${ATTR_HEX.Melody}" font-size="11" font-weight="bold">${p.notes20}</text>
  `;
  const lineMinCount = `
    <line x1="${M.left}" y1="95" x2="${minCountX}" y2="95" stroke="${COLOR.shrink}" stroke-width="10" stroke-linecap="round"/>
    <text x="${M.left - 8}" y="99" text-anchor="end" fill="${COLOR.text}" font-size="11" font-weight="bold">minCount</text>
    <text x="${minCountX + 6}" y="99" fill="${COLOR.shrink}" font-size="11" font-weight="bold">${p.minCount}</text>
  `;
  const resultLine = `
    <line x1="${resultX}" y1="40" x2="${resultX}" y2="135" stroke="${COLOR.mainDark}" stroke-width="2" stroke-dasharray="3 3"/>
    <text x="${resultX + 6}" y="130" fill="${COLOR.mainDark}" font-size="11" font-weight="bold">
      excludeHead = max(${p.notes20}, ${p.minCount}) = ${result}
    </text>
  `;
  const caseTitle = p.caseLabel
    ? `<text x="${M.left - 10}" y="20" fill="${COLOR.text}" font-size="12" font-weight="bold">${escapeXml(p.caseLabel)}</text>`
    : '';

  // スケール目盛
  const axis = `
    <line x1="${M.left}" y1="150" x2="${M.left + innerW}" y2="150" stroke="${COLOR.muted}" stroke-width="1"/>
    ${Array.from({ length: 6 }, (_, i) => {
      const n = Math.round((maxRange * i) / 5);
      const x = xScale(n);
      return `<line x1="${x}" y1="150" x2="${x}" y2="154" stroke="${COLOR.muted}"/>
              <text x="${x}" y="166" text-anchor="middle" fill="${COLOR.muted}" font-size="9">${n}</text>`;
    }).join('')}
  `;

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="先頭除外の計算">
    ${caseTitle}
    ${axis}
    ${lineNotes20}
    ${lineMinCount}
    ${resultLine}
  </svg>`;
}

/* ================================================================
 * (D) カバー率の合算と 100% キャップ図
 * ================================================================ */
export interface CoverageDiagramParams {
  songDuration: number;
  segments: { label: string; seconds: number; color: string }[];
}

export function coverageDiagramSvg(p: CoverageDiagramParams): string {
  const W = 760, H = 220;
  const M = { top: 30, right: 20, bottom: 60, left: 20 };
  const innerW = W - M.left - M.right;
  const barH = 40;
  const totalSec = p.segments.reduce((a, s) => a + s.seconds, 0);
  const maxRange = Math.max(totalSec, p.songDuration) * 1.05;
  const xScale = (sec: number) => M.left + (sec / maxRange) * innerW;

  // ベースバー (songDuration = 100% の尺)
  const baseBar = `
    <rect x="${M.left}" y="${M.top}" width="${xScale(p.songDuration) - M.left}" height="${barH}"
          fill="#f3f4f6" stroke="${COLOR.grid}" stroke-width="1"/>
    <text x="${M.left + 6}" y="${M.top + barH / 2 + 4}"
          fill="${COLOR.muted}" font-size="10">songDuration = ${p.songDuration}秒 (100%)</text>
  `;

  // キューイング: セグメントを連結（横方向にシフト）
  let cursor = 0;
  const segmentsSvg = p.segments.map((s) => {
    const x1 = xScale(cursor);
    const x2Full = xScale(cursor + s.seconds);
    const cappedEnd = Math.min(cursor + s.seconds, p.songDuration);
    const x2Cap = xScale(cappedEnd);
    cursor += s.seconds;

    // 100% 内の塗り（実効）
    const inPart = x2Cap > x1
      ? `<rect x="${x1}" y="${M.top}" width="${x2Cap - x1}" height="${barH}"
              fill="${s.color}" opacity="0.9">
           <title>${escapeXml(s.label)} (実効部 ${Math.min(s.seconds, p.songDuration - (cursor - s.seconds))}秒)</title>
         </rect>`
      : '';
    // 超過分（100% を越えた部分）
    const overPart = x2Full > x2Cap
      ? `<rect x="${x2Cap}" y="${M.top}" width="${x2Full - x2Cap}" height="${barH}"
              fill="${s.color}" opacity="0.3" stroke="${s.color}" stroke-dasharray="4 2" stroke-width="1.5">
           <title>${escapeXml(s.label)} (超過部 = 切り捨て)</title>
         </rect>`
      : '';
    return inPart + overPart;
  }).join('\n');

  // 100% キャップの縦線（ラベルは summary で明示するため、SVG 内は短い注記のみ）
  const capLabelX = xScale(p.songDuration);
  const capLine = `
    <line x1="${capLabelX}" y1="${M.top - 4}" x2="${capLabelX}" y2="${M.top + barH + 6}"
          stroke="${COLOR.mainDark}" stroke-width="2"/>
    <text x="${capLabelX - 4}" y="${M.top - 6}" text-anchor="end"
          fill="${COLOR.mainDark}" font-size="10" font-weight="bold">100%→</text>
  `;

  // 目盛
  const secTicks: string[] = [];
  for (let s = 0; s <= maxRange; s += 20) {
    const x = xScale(s);
    secTicks.push(
      `<line x1="${x}" y1="${M.top + barH}" x2="${x}" y2="${M.top + barH + 4}" stroke="${COLOR.muted}"/>
       <text x="${x}" y="${M.top + barH + 16}" text-anchor="middle" fill="${COLOR.muted}" font-size="9">${s}s</text>`
    );
  }

  // 凡例
  const legendItems = p.segments.map((s, i) =>
    `<g transform="translate(${M.left + i * 320}, ${M.top + barH + 32})">
       <rect width="14" height="10" fill="${s.color}" opacity="0.9"/>
       <text x="18" y="9" fill="${COLOR.text}" font-size="10">${escapeXml(s.label)} = ${s.seconds}秒</text>
     </g>`
  ).join('\n');

  const rawPct = ((totalSec / p.songDuration) * 100).toFixed(1);
  const cappedPct = Math.min(100, Number(rawPct)).toFixed(1);
  const summary = `
    <text x="${W - M.right}" y="18" text-anchor="end" fill="${COLOR.text}" font-size="11">
      Σ / songDuration = ${totalSec} / ${p.songDuration} = ${rawPct}% → min(_, 100%) = ${cappedPct}%
    </text>
  `;

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="カバー率の合算と 100% キャップ">
    ${baseBar}
    ${segmentsSvg}
    ${capLine}
    ${secTicks.join('\n')}
    ${summary}
    ${legendItems}
  </svg>`;
}

/* ================================================================
 * (E) 縮小スコア加算式の図解
 * ================================================================ */
export function formulaDiagramSvg(): string {
  const W = 760, H = 240;
  // 中央大文字の式
  const formula = `
    <text x="${W / 2}" y="70" text-anchor="middle" fill="${COLOR.text}"
          font-size="22" font-family="serif">
      floor(
      <tspan fill="${COLOR.main}" font-weight="bold">eligibleBaseScore</tspan>
       × (
      <tspan fill="${COLOR.shrinkDark}" font-weight="bold">rate − 1.0</tspan>
      ) ×
      <tspan fill="${COLOR.emerald}" font-weight="bold">coverageRate</tspan>
      )
    </text>
  `;
  // 各項の説明ボックス
  const boxes = [
    { x: 30, y: 110, w: 220, h: 100, color: COLOR.main,
      title: 'eligibleBaseScore', lines: ['先頭除外後のノートの', 'アシスト適用済み素点合計', '(note.group ≠ notes_20 のみ)'] },
    { x: 270, y: 110, w: 220, h: 100, color: COLOR.shrinkDark,
      title: 'rate − 1.0', lines: ['縮小倍率 rate から通常分', '1.0 を引いた追加倍率', 'Lv1=0.2 / Lv5=0.6'] },
    { x: 510, y: 110, w: 220, h: 100, color: COLOR.emerald,
      title: 'coverageRate', lines: ['min(raw / songDuration, 1.0)', '期待値計算では期待カバー率', '(§4 参照)'] },
  ];
  const boxSvg = boxes.map((b) =>
    `<g>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" ry="6"
            fill="white" stroke="${b.color}" stroke-width="2"/>
      <text x="${b.x + b.w / 2}" y="${b.y + 24}" text-anchor="middle"
            fill="${b.color}" font-size="14" font-weight="bold">${b.title}</text>
      ${b.lines.map((l, i) =>
        `<text x="${b.x + b.w / 2}" y="${b.y + 46 + i * 16}" text-anchor="middle"
               fill="${COLOR.text}" font-size="11">${escapeXml(l)}</text>`
      ).join('')}
    </g>`
  ).join('\n');

  // 下線カラー
  const underlines = boxes.map((b, i) => {
    const cx = 30 + 240 * i + b.w / 2;
    return `<line x1="${cx - 60}" y1="86" x2="${cx + 60}" y2="86" stroke="${b.color}" stroke-width="3"/>`;
  }).join('\n');

  return `<svg viewBox="0 0 ${W} ${H}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="縮小スコア加算式">
    <text x="${W / 2}" y="28" text-anchor="middle" fill="${COLOR.muted}" font-size="11">
      縮小スキルによるスコア追加分（§5）
    </text>
    ${formula}
    ${underlines}
    ${boxSvg}
  </svg>`;
}

/* ================================================================
 * (F) モンテカルロ分布のイメージ
 * ================================================================ */
export interface McDistributionParams {
  baseScore: number;
  seed: number;
  iterations: number;
}

/**
 * 縮小スキル 1 枚構成の疑似スコア分布を生成する。
 * 発動回数が二項分布 Binomial(maxActivations, per) に従うと仮定し、
 * 1 回発動あたりの加算量を固定値として単純加算する。
 * デモ用途のため、実エンジンの MC とは別の簡易モデル。
 */
export function generateDemoScores(params: {
  baseScore: number;
  maxActivations: number;
  per: number;
  addPerActivation: number;
  seed: number;
  n: number;
}): number[] {
  const rng = new XorShift128Plus(params.seed);
  const scores: number[] = [];
  const p = params.per / 100;
  for (let t = 0; t < params.n; t++) {
    let fired = 0;
    for (let k = 0; k < params.maxActivations; k++) {
      if (rng.next() < p) fired++;
    }
    scores.push(params.baseScore + fired * params.addPerActivation);
  }
  return scores;
}

export function mcDistributionSvg(p: McDistributionParams): string {
  // 典型例: Card 1952 (count=20, per=40%, value=4, rate=1.6) × MONSTER GENERATiON
  const scores = generateDemoScores({
    baseScore: p.baseScore,
    maxActivations: 20,
    per: 40,
    addPerActivation: 3500, // 1 回発動あたりの平均加算量 (1 秒あたり縮小加算 × value秒)
    seed: p.seed,
    n: p.iterations,
  });
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return renderHistogramSvg(scores, min, max, mean, {
    xAxisLabel: 'スコア (デモ分布)',
    barColor: COLOR.shrink,
  });
}
