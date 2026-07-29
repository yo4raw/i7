/**
 * スコア計算仕様解説ページ (src/pages/score-calc/spec.astro) 用 SVG 生成ヘルパー。
 *
 * histogram.ts / donutChart.ts と同じく「インライン SVG 文字列を返す関数」パターン。
 * 呼び出し側は `<Fragment set:html={...} />` または `{@html ...}` で埋め込む。
 *
 * ビジュアル言語 (ADR 0043):
 *  - 計算段階別の配色: 属性値=インク（無彩色）/ 素点=sky / スコアアップ=amber / 縮小=orange /
 *    最終補正=emerald / 統計=グレー+赤アクセント
 *    ※ 属性値と統計はどちらも無彩色だが、明度差（インク濃 / グレー中間）で識別する
 *  - floor（切り捨て）の発生箇所は ⌊ ⌋ マーカーで明示する
 *  - 俯瞰図 pipelineOverviewSvg は highlight 指定で「現在地」を示すミニマップとして再掲する
 */

import { ATTR_HEX } from '../constants';
import { LIGHT_MULTIPLIER } from './constants';
import { renderHistogramSvg } from './histogram';
import { Sfc32 } from './rng';
import type { ComputedTeam } from './types';

/* ================================================================
 * 共通: 配色・部品
 * ================================================================ */

/** 計算段階のキー（俯瞰図・章の現在地表示に使用） */
export type StageKey = 'attr' | 'note' | 'scoreUp' | 'shrink' | 'final' | 'stats';

/** 計算段階別の配色（ライトテーマ固定） */
export const STAGE_COLORS: Record<StageKey, { main: string; dark: string; pale: string }> = {
  attr:    { main: '#2A2C33', dark: '#14151A', pale: '#E8E9EC' }, // インク（無彩色クローム）
  note:    { main: '#0ea5e9', dark: '#0369a1', pale: '#e0f2fe' }, // sky
  scoreUp: { main: '#f59e0b', dark: '#b45309', pale: '#fef3c7' }, // amber
  shrink:  { main: '#f97316', dark: '#c2410c', pale: '#ffedd5' }, // orange
  final:   { main: '#10b981', dark: '#047857', pale: '#d1fae5' }, // emerald
  stats:   { main: '#6b7280', dark: '#374151', pale: '#f3f4f6' }, // gray
} as const;

const GRID = 'var(--chart-grid)';
const TEXT = 'var(--chart-text)';
const MUTED = 'var(--chart-axis-label)';
const EXCLUDE_BG = 'var(--chart-exclude-border)';
const ACCENT_RED = '#ef4444';

/** 縮小スキル複数枚表示用のカード別カラー（orange 系の濃度違い） */
export const CARD_COLORS = ['#f97316', '#ea580c', '#c2410c', '#9a3412', '#7c2d12'] as const;

function escapeXml(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

/** 矢印マーカー定義（1 SVG につき 1 回） */
function arrowDef(id: string, color: string): string {
  return `<marker id="${id}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="${color}" />
  </marker>`;
}

/** floor 発生マーカー: ⌊ ⌋ バッジ */
function floorBadge(x: number, y: number, color: string): string {
  return `<g>
    <rect x="${x - 13}" y="${y - 10}" width="26" height="16" rx="8" fill="white" stroke="${color}" stroke-width="1.2"/>
    <text x="${x}" y="${y + 2.5}" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold">⌊ ⌋</text>
  </g>`;
}

function svgOpen(w: number, h: number, label: string): string {
  return `<svg viewBox="0 0 ${w} ${h}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escapeXml(label)}">`;
}

/* ================================================================
 * 0. パイプライン俯瞰図（現在地ハイライト対応）
 * ================================================================ */

const PIPELINE_STAGES: { key: StageKey; title: string; sub: string }[] = [
  { key: 'attr',    title: 'チーム属性値', sub: '衣装6枠 + ブローチ\n+ センタースキル' },
  { key: 'note',    title: '1ノーツ素点', sub: '属性値 × ノートレート\n× ライト倍率' },
  { key: 'scoreUp', title: 'スコアアップ加算', sub: '発動ごとに\n固定値を加算' },
  { key: 'shrink',  title: '判定縮小加算', sub: '発動中のノーツを\n1.6倍などに増幅' },
  { key: 'final',   title: '最終補正', sub: 'バッジ倍率\n+ ブローチ直接加算' },
  { key: 'stats',   title: 'リザルト分布', sub: '理論値・期待値\nMC シミュレーション' },
];

/**
 * スコア計算パイプラインの俯瞰図。
 * highlight を指定すると該当段階のみ塗りつぶし、他を淡色化した「現在地」版になる。
 */
export function pipelineOverviewSvg(opts?: { highlight?: StageKey }): string {
  const highlight = opts?.highlight;
  const boxW = 128, boxH = 64, gap = 22;
  const W = PIPELINE_STAGES.length * boxW + (PIPELINE_STAGES.length - 1) * gap + 24;
  const H = 96;
  const y = 14;

  const parts: string[] = [];
  PIPELINE_STAGES.forEach((s, i) => {
    const x = 12 + i * (boxW + gap);
    const c = STAGE_COLORS[s.key];
    const active = highlight === undefined || highlight === s.key;
    const fill = highlight === s.key ? c.pale : 'white';
    const opacity = active ? 1 : 0.35;
    const subLines = s.sub.split('\n').map((l, li) =>
      `<tspan x="${x + boxW / 2}" dy="${li === 0 ? 14 : 11}">${escapeXml(l)}</tspan>`).join('');
    parts.push(`<g opacity="${opacity}">
      <rect x="${x}" y="${y}" width="${boxW}" height="${boxH}" rx="8"
            fill="${fill}" stroke="${c.main}" stroke-width="${highlight === s.key ? 3 : 2}"/>
      <text x="${x + boxW / 2}" y="${y + 20}" text-anchor="middle" fill="${c.dark}" font-size="12" font-weight="bold">${escapeXml(s.title)}</text>
      <text x="${x + boxW / 2}" y="${y + 30}" text-anchor="middle" fill="${MUTED}" font-size="9">${subLines}</text>
    </g>`);
    if (i < PIPELINE_STAGES.length - 1) {
      const nextActive = highlight === undefined || highlight === PIPELINE_STAGES[i + 1].key || highlight === s.key;
      parts.push(`<line x1="${x + boxW + 2}" y1="${y + boxH / 2}" x2="${x + boxW + gap - 3}" y2="${y + boxH / 2}"
        stroke="${MUTED}" stroke-width="2" marker-end="url(#pipe-arrow)" opacity="${nextActive ? 1 : 0.35}"/>`);
    }
  });

  return `${svgOpen(W, H, 'スコア計算パイプラインの俯瞰図')}
    <defs>${arrowDef('pipe-arrow', '#9ca3af')}</defs>
    ${parts.join('\n')}
  </svg>`;
}

/* ================================================================
 * 1. チーム属性値
 * ================================================================ */

/**
 * チーム属性値の内訳セグメント配色（無彩色 4 段階、寄与の大きい順に濃い）。
 *
 * 積み上げバーはセグメントを境界線なしで直接隣接させるため、隣り合う 2 色間で
 * 十分な明度差が要る。下記は隣接ペアすべてで 1.8:1 以上を確保している:
 *   raw–broach 2.41:1 / broach–center 2.31:1 / center–friend 1.82:1
 * ブローチが 0 の行では raw と center が直接隣接するため、その組合せ (5.57:1) も
 * 判別可能にしてある。最淡の friend も白カード地に対して 1.77:1 あり輪郭が見える。
 */
const ATTR_STACK_COLORS = {
  raw: '#14151A',
  broach: '#4B5563',
  center: '#8A909C',
  friend: '#BFC4CE',
} as const;

/** チーム属性値の内訳（素値/ブローチ/センター/フレンド）積み上げバー */
export function teamAttrStackSvg(team: ComputedTeam): string {
  const c = STAGE_COLORS.attr;
  const SEGMENTS = [
    { key: 'raw', label: '衣装素値 (特効込み)', color: ATTR_STACK_COLORS.raw },
    { key: 'broach', label: 'ブローチ', color: ATTR_STACK_COLORS.broach },
    { key: 'center', label: 'センタースキル', color: ATTR_STACK_COLORS.center },
    { key: 'friend', label: 'フレンドスキル', color: ATTR_STACK_COLORS.friend },
  ] as const;
  const rows = (['Shout', 'Beat', 'Melody'] as const).map(attr => ({
    attr,
    raw: team[`raw${attr}`],
    broach: team[`broach${attr}`],
    center: team[`center${attr}`],
    friend: team[`friend${attr}`],
    total: team[attr],
  }));

  const W = 760, rowH = 34, barH = 20;
  const M = { top: 34, left: 74, right: 88, bottom: 10 };
  const H = M.top + rows.length * rowH + M.bottom;
  const innerW = W - M.left - M.right;
  const maxTotal = Math.max(...rows.map(r => r.total));
  const xw = (v: number) => (v / maxTotal) * innerW;

  const legend = SEGMENTS.map((s, i) =>
    `<g transform="translate(${M.left + i * 170}, 8)">
      <rect width="12" height="10" rx="2" fill="${s.color}"/>
      <text x="16" y="9" fill="${TEXT}" font-size="10">${escapeXml(s.label)}</text>
    </g>`).join('');

  const bars = rows.map((r, ri) => {
    const y = M.top + ri * rowH + (rowH - barH) / 2;
    let x = M.left;
    const segs = SEGMENTS.map(s => {
      const v = r[s.key];
      if (v <= 0) return '';
      const w = xw(v);
      const rect = `<rect x="${x}" y="${y}" width="${w}" height="${barH}" fill="${s.color}">
        <title>${r.attr} ${escapeXml(s.label)}: ${fmt(v)}</title></rect>`;
      x += w;
      return rect;
    }).join('');
    return `<g>
      <circle cx="${M.left - 62}" cy="${y + barH / 2}" r="5" fill="${ATTR_HEX[r.attr]}"/>
      <text x="${M.left - 52}" y="${y + barH / 2 + 4}" fill="${TEXT}" font-size="11" font-weight="bold">${r.attr}</text>
      ${segs}
      <text x="${M.left + xw(r.total) + 6}" y="${y + barH / 2 + 4}" fill="${c.dark}" font-size="11" font-weight="bold">${fmt(r.total)}</text>
    </g>`;
  }).join('\n');

  return `${svgOpen(W, H, 'チーム属性値の内訳（積み上げバー）')}
    ${legend}
    ${bars}
  </svg>`;
}

/** チーム属性値の計算手順チェーン図（静的、floor/round の位置を明示） */
export function attrFormulaSvg(): string {
  const c = STAGE_COLORS.attr;
  const W = 860, H = 190;
  const steps = [
    { x: 12,  w: 150, title: '衣装の基礎値', sub: ['特訓済み: *_max', '未特訓: 自属性のみ', 'sp_time×sp_value を減算'] },
    { x: 182, w: 140, title: '× イベント特効', sub: ['特効倍率を乗算', 'round (四捨五入)'] },
    { x: 342, w: 150, title: '+ 加算アイテム', sub: ['ラビットノート', '(キャラ初出スロット)', 'ブローチ (UR のみ)'] },
    { x: 512, w: 130, title: '6 枠を合算', sub: ['センター/メンバー', '/フレンド'] },
    { x: 662, w: 186, title: '+ センタースキル', sub: ['合算値 × 増加率', '(UR 10% / SSR 7%)', 'センター+フレンド合算後に floor'] },
  ];
  const y = 40, h = 92;
  const boxes = steps.map(s => {
    const subLines = s.sub.map((l, i) =>
      `<tspan x="${s.x + s.w / 2}" dy="${i === 0 ? 16 : 13}">${escapeXml(l)}</tspan>`).join('');
    return `<g>
      <rect x="${s.x}" y="${y}" width="${s.w}" height="${h}" rx="8" fill="white" stroke="${c.main}" stroke-width="2"/>
      <text x="${s.x + s.w / 2}" y="${y + 20}" text-anchor="middle" fill="${c.dark}" font-size="12" font-weight="bold">${escapeXml(s.title)}</text>
      <text x="${s.x + s.w / 2}" y="${y + 32}" text-anchor="middle" fill="${MUTED}" font-size="9.5">${subLines}</text>
    </g>`;
  }).join('\n');
  const arrows = steps.slice(0, -1).map((s, i) => {
    const x1 = s.x + s.w, x2 = steps[i + 1].x;
    return `<line x1="${x1 + 2}" y1="${y + h / 2}" x2="${x2 - 3}" y2="${y + h / 2}" stroke="${c.main}" stroke-width="2" marker-end="url(#attr-arrow)"/>`;
  }).join('\n');

  return `${svgOpen(W, H, 'チーム属性値の計算手順')}
    <defs>${arrowDef('attr-arrow', c.main)}</defs>
    ${boxes}
    ${arrows}
    ${floorBadge(28, y + h + 18, c.dark)}
    <text x="46" y="${y + h + 22}" fill="${MUTED}" font-size="10">= 小数点以下切り捨てが起きる場所</text>
    <text x="12" y="24" fill="${MUTED}" font-size="10">衣装 1 枠ごとに左から順に計算し、最後にチーム全体へセンタースキルを適用します</text>
  </svg>`;
}

/* ================================================================
 * 2. 1ノーツの素点
 * ================================================================ */

const GROUP_LABELS: Record<string, string> = {
  notes_20: '序盤20',
  light_2: 'ライト2',
  light_3: 'ライト3',
  light_4: 'ライト4',
  light_5: 'ライト5',
  light_6: 'ライト6',
  chorus_light_5: 'サビ光5',
  chorus_light_6: 'サビ光6',
};

/** ライト倍率の段階チャート（デモ楽曲のノーツ数を添える） */
export function lightMultiplierChartSvg(groupSizes?: Record<string, number>): string {
  const c = STAGE_COLORS.note;
  const groups = Object.keys(LIGHT_MULTIPLIER);
  const W = 760, H = 240;
  const M = { top: 26, left: 46, right: 16, bottom: 56 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  const maxMult = 3.0;
  const bw = innerW / groups.length;

  const yAxis = [1.0, 1.5, 2.0, 2.6, 3.0].map(v => {
    const y = M.top + innerH - (v / maxMult) * innerH;
    return `<line x1="${M.left}" y1="${y}" x2="${M.left + innerW}" y2="${y}" stroke="${GRID}" stroke-width="1"/>
      <text x="${M.left - 6}" y="${y + 3}" text-anchor="end" fill="${MUTED}" font-size="9">×${v.toFixed(1)}</text>`;
  }).join('');

  const bars = groups.map((g, i) => {
    const mult = LIGHT_MULTIPLIER[g];
    const isChorus = g.startsWith('chorus');
    const barW = bw * 0.62;
    const x = M.left + i * bw + (bw - barW) / 2;
    const h = (mult / maxMult) * innerH;
    const y = M.top + innerH - h;
    const n = groupSizes?.[g];
    const countLabel = n !== undefined
      ? `<text x="${x + barW / 2}" y="${M.top + innerH + 30}" text-anchor="middle" fill="${MUTED}" font-size="9">${n}ノーツ</text>`
      : '';
    return `<g>
      <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${isChorus ? c.dark : c.main}">
        <title>${GROUP_LABELS[g] ?? g}: ×${mult}</title></rect>
      <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" fill="${c.dark}" font-size="11" font-weight="bold">×${mult}</text>
      <text x="${x + barW / 2}" y="${M.top + innerH + 16}" text-anchor="middle" fill="${TEXT}" font-size="10">${escapeXml(GROUP_LABELS[g] ?? g)}</text>
      ${countLabel}
    </g>`;
  }).join('\n');

  return `${svgOpen(W, H, 'ライト段階ごとのスコア倍率')}
    ${yAxis}
    ${bars}
    <text x="${M.left}" y="14" fill="${MUTED}" font-size="10">ライブが進む（ライトが増える）ほど 1 ノーツの価値が上がり、サビ光では最大 3.0 倍になります</text>
  </svg>`;
}

export interface NoteScoreStepsParams {
  /** チーム属性値（アシスト適用後） */
  appeal: number;
  /** 属性名（表示用） */
  attr: 'Shout' | 'Beat' | 'Melody';
  /** ノーツ種別 */
  noteType: 'white' | 'color';
  /** ノートレート (0.025 / 0.030) */
  noteRate: number;
  /** グループキー (LIGHT_MULTIPLIER のキー) */
  group: string;
}

/** 1 ノーツの素点計算ステップ図（実数値入り） */
export function noteScoreStepsSvg(p: NoteScoreStepsParams): string {
  const c = STAGE_COLORS.note;
  const mult = LIGHT_MULTIPLIER[p.group] ?? 1.0;
  const perNoteBase = Math.floor(p.appeal * p.noteRate);
  const score = Math.floor(perNoteBase * mult);
  const typeLabel = p.noteType === 'color' ? '色ノーツ' : '白ノーツ';
  const ratePct = `${(p.noteRate * 100).toFixed(1)}%`;

  const W = 820, H = 150;
  const y = 42, h = 64;
  const boxes = [
    { x: 12,  w: 170, title: `チーム属性値 (${p.attr})`, value: fmt(p.appeal), color: STAGE_COLORS.attr },
    { x: 236, w: 160, title: `× ノートレート ${ratePct}`, value: fmt(perNoteBase), color: c, floorBefore: true },
    { x: 452, w: 170, title: `× ライト倍率 ${mult.toFixed(1)}`, value: fmt(score), color: c, floorBefore: true },
    { x: 668, w: 140, title: 'このノーツの素点', value: fmt(score), color: c, strong: true },
  ];

  const parts = boxes.map(b => {
    const fill = b.strong ? b.color.pale : 'white';
    return `<g>
      <rect x="${b.x}" y="${y}" width="${b.w}" height="${h}" rx="8" fill="${fill}" stroke="${b.color.main}" stroke-width="2"/>
      <text x="${b.x + b.w / 2}" y="${y + 22}" text-anchor="middle" fill="${b.color.dark}" font-size="11" font-weight="bold">${escapeXml(b.title)}</text>
      <text x="${b.x + b.w / 2}" y="${y + 46}" text-anchor="middle" fill="${TEXT}" font-size="16" font-weight="bold">${b.value}</text>
    </g>`;
  }).join('\n');

  const arrows = boxes.slice(0, -1).map((b, i) => {
    const x1 = b.x + b.w, x2 = boxes[i + 1].x;
    const midX = (x1 + x2) / 2;
    const floorMark = boxes[i + 1].floorBefore ? floorBadge(midX, y - 6, c.dark) : '';
    return `<line x1="${x1 + 2}" y1="${y + h / 2}" x2="${x2 - 3}" y2="${y + h / 2}" stroke="${c.main}" stroke-width="2" marker-end="url(#note-arrow)"/>
      ${floorMark}`;
  }).join('\n');

  return `${svgOpen(W, H, '1ノーツの素点計算ステップ')}
    <defs>${arrowDef('note-arrow', c.main)}</defs>
    <text x="12" y="24" fill="${MUTED}" font-size="10">例: ${escapeXml(GROUP_LABELS[p.group] ?? p.group)} 区間の ${p.attr} ${typeLabel} 1 個のスコア（⌊ ⌋ = 直前の乗算結果を切り捨て）</text>
    ${parts}
    ${arrows}
  </svg>`;
}

/* ================================================================
 * 3. スコアアップスキル
 * ================================================================ */

export interface ScoreUpLane {
  label: string;
  /** ノート型なら「何ノーツごと」、タイマー型なら「何秒ごと」 */
  count: number;
  per: number;
  value: number;
  isTimer: boolean;
}

export interface ScoreUpTimelineParams {
  lanes: ScoreUpLane[];
  notesCount: number;
  songDuration: number;
  seed: number;
}

/** スコアアップスキルの発動タイムライン（ノート型・タイマー型を並べる） */
export function scoreUpTimelineSvg(p: ScoreUpTimelineParams): string {
  const c = STAGE_COLORS.scoreUp;
  const laneH = 56;
  const W = 820;
  const M = { top: 14, left: 20, right: 20, bottom: 34 };
  const innerW = W - M.left - M.right;
  const H = M.top + p.lanes.length * laneH + M.bottom;
  const rng = new Sfc32(p.seed);

  const lanes = p.lanes.map((lane, li) => {
    const yBase = M.top + li * laneH + laneH - 14;
    const maxAct = lane.isTimer
      ? Math.floor(p.songDuration / lane.count)
      : Math.floor(p.notesCount / lane.count);
    const marks: string[] = [];
    let fired = 0;
    for (let k = 1; k <= maxAct; k++) {
      const t = lane.isTimer ? (k * lane.count) / p.songDuration : (k * lane.count) / p.notesCount;
      const x = M.left + t * innerW;
      const hit = rng.next() * 100 < lane.per;
      if (hit) {
        fired++;
        marks.push(`<line x1="${x}" y1="${yBase}" x2="${x}" y2="${yBase - 22}" stroke="${c.main}" stroke-width="2"/>
          <circle cx="${x}" cy="${yBase - 26}" r="4.5" fill="${c.main}"><title>発動 +${fmt(lane.value)}</title></circle>`);
      } else {
        marks.push(`<circle cx="${x}" cy="${yBase}" r="3.5" fill="var(--chart-mute-fill)" stroke="white" stroke-width="1"><title>不発</title></circle>`);
      }
    }
    const gained = fired * lane.value;
    return `<g>
      <line x1="${M.left}" y1="${yBase}" x2="${M.left + innerW}" y2="${yBase}" stroke="${GRID}" stroke-width="1.5"/>
      ${marks.join('\n')}
      <text x="${M.left}" y="${yBase - 34}" fill="${c.dark}" font-size="11" font-weight="bold">${escapeXml(lane.label)}</text>
      <text x="${M.left + innerW}" y="${yBase - 34}" text-anchor="end" fill="${TEXT}" font-size="10">発動 ${fired}/${maxAct} 回 → +${fmt(gained)}</text>
    </g>`;
  }).join('\n');

  const ticks: string[] = [];
  for (let s = 0; s <= p.songDuration; s += 20) {
    const x = M.left + (s / p.songDuration) * innerW;
    ticks.push(`<line x1="${x}" y1="${H - M.bottom + 4}" x2="${x}" y2="${H - M.bottom + 8}" stroke="${MUTED}"/>
      <text x="${x}" y="${H - M.bottom + 20}" text-anchor="middle" fill="${MUTED}" font-size="9">${s}s</text>`);
  }

  return `${svgOpen(W, H, 'スコアアップスキルの発動タイムライン')}
    ${lanes}
    ${ticks.join('\n')}
    <text x="${M.left}" y="${H - 4}" fill="${MUTED}" font-size="9.5">●=発動（value を即座に加算） / 灰=不発。ノート型はノーツ数、タイマー型は経過秒数で判定タイミングが決まります</text>
  </svg>`;
}

/* ================================================================
 * 4. 判定縮小スキル（タイムライン・先頭除外・カバー率・加算式）
 * ================================================================ */

export interface Activation {
  start: number;    // ノート index (inclusive)
  end: number;      // ノート index (exclusive)
  fired: boolean;   // true=発動, false=不発
  cardIndex?: number;
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
  const rng = new Sfc32(p.seed);
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

  type Trigger = {
    cardIndex: number;
    noteIndex: number;
    fired: boolean;
    valueInNotes: number;
  };
  const rng = new Sfc32(p.seed);
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

  triggers.sort((a, b) => a.noteIndex - b.noteIndex || a.cardIndex - b.cardIndex);

  const acts: Activation[] = [];
  let currentEnd = 0;
  for (const t of triggers) {
    if (!t.fired) {
      acts.push({ start: t.noteIndex, end: t.noteIndex, fired: false, cardIndex: t.cardIndex });
      continue;
    }
    const start = Math.max(t.noteIndex, currentEnd);
    if (start >= p.notesCount) continue;
    const end = Math.min(start + t.valueInNotes, p.notesCount);
    acts.push({ start, end, fired: true, cardIndex: t.cardIndex });
    currentEnd = end;
  }
  return acts;
}

/** 縮小スキルの発動タイムライン図（マルチカード対応） */
export function shrinkTimelineSvg(p: ShrinkTimelineParams): string {
  const cards: ShrinkCardParam[] = p.cards ?? [{ count: p.count, per: p.per, value: p.value }];
  const numCards = cards.length;

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

  const excludeX1 = xScale(0);
  const excludeX2 = xScale(excludeHead);
  const excludeRect = excludeHead > 0
    ? `<rect x="${excludeX1}" y="${M.top}" width="${excludeX2 - excludeX1}" height="${innerH}"
              fill="${EXCLUDE_BG}" opacity="0.6"/>
       <text x="${(excludeX1 + excludeX2) / 2}" y="${M.top + 12}" text-anchor="middle"
             fill="${MUTED}" font-size="10">先頭除外 ${excludeHead}ノート</text>`
    : '';

  const coins: string[] = [];
  const gridLines: string[] = [];
  for (const a of activations) {
    const ci = a.cardIndex ?? 0;
    const x = xScale(a.start);
    const cy = M.top + 10 + ci * coinLaneH;
    if (ci === 0) {
      gridLines.push(
        `<line x1="${x}" y1="${M.top}" x2="${x}" y2="${M.top + innerH}" stroke="${GRID}" stroke-width="1" stroke-dasharray="3 2"/>`
      );
    }
    coins.push(
      `<circle cx="${x}" cy="${cy}" r="5"
               fill="${a.fired ? '#22c55e' : 'var(--chart-mute-fill)'}" stroke="white" stroke-width="1.5">
         <title>衣装${ci + 1}: ${a.fired ? '発動' : '不発'} (note=${a.start})</title>
       </circle>`
    );
  }

  const laneLabels = cards.map((_, i) =>
    `<text x="${M.left - 4}" y="${M.top + 14 + i * coinLaneH}" text-anchor="end"
           fill="${CARD_COLORS[i]}" font-size="10" font-weight="bold">${i + 1}</text>`
  ).join('\n');

  const barY = M.top + coinLaneH * numCards + 4;
  const fillBars = activations.filter((a) => a.fired).map((a) => {
    const ci = a.cardIndex ?? 0;
    const x1 = xScale(a.start);
    const x2 = xScale(a.end);
    return `<rect x="${x1}" y="${barY}" width="${x2 - x1}" height="${barH}"
                  fill="${CARD_COLORS[ci]}" opacity="0.85">
              <title>衣装${ci + 1}: 発動区間 ${a.start}-${a.end}</title>
            </rect>`;
  }).join('\n');

  const secondsTicks: string[] = [];
  for (let s = 0; s <= p.songDuration; s += 10) {
    const noteIdx = (s / p.songDuration) * p.notesCount;
    const x = xScale(noteIdx);
    secondsTicks.push(
      `<line x1="${x}" y1="${M.top + innerH}" x2="${x}" y2="${M.top + innerH + 4}" stroke="${MUTED}" stroke-width="1"/>
       <text x="${x}" y="${M.top + innerH + 16}" text-anchor="middle" fill="${MUTED}" font-size="9">${s}s</text>`
    );
  }

  const firedPerCard = cards.map((_, i) => activations.filter((a) => a.fired && a.cardIndex === i).length);
  const triggersPerCard = cards.map((_, i) => activations.filter((a) => a.cardIndex === i).length);
  const coverPerCard = cards.map((c, i) => firedPerCard[i] * c.value);
  const totalCoverRaw = coverPerCard.reduce((a, b) => a + b, 0);
  const totalCoverCapped = Math.min(totalCoverRaw, p.songDuration);
  const coverPct = ((totalCoverCapped / p.songDuration) * 100).toFixed(1);
  const summary = cards.map((c, i) =>
    `衣装${i + 1} (${c.count}ノーツ/${c.per}%/${c.value}秒): ${firedPerCard[i]}/${triggersPerCard[i]}回 (${coverPerCard[i]}秒)`
  ).join(' ／ ');

  return `${svgOpen(W, H, '縮小スキルのタイムライン')}
    <line x1="${M.left}" y1="${M.top + innerH}" x2="${M.left + innerW}" y2="${M.top + innerH}" stroke="${MUTED}" stroke-width="1"/>
    ${excludeRect}
    ${gridLines.join('\n')}
    ${laneLabels}
    ${fillBars}
    ${coins.join('\n')}
    ${secondsTicks.join('\n')}
    <text x="${M.left}" y="${H - 6}" fill="${TEXT}" font-size="10">
      ${escapeXml(summary)} ／ 合計カバー ${totalCoverCapped}秒 (${coverPct}%)
    </text>
  </svg>`;
}

export interface ExcludeHeadParams {
  notes20: number;
  minCount: number;
  caseLabel?: string;
}

/** 先頭除外 excludeHead = max(notes_20, minCount) の比較図 */
export function excludeHeadSvg(p: ExcludeHeadParams): string {
  const c = STAGE_COLORS.shrink;
  const W = 640, H = 180;
  const M = { top: 30, right: 20, bottom: 30, left: 74 };
  const innerW = W - M.left - M.right;
  const maxRange = Math.max(p.notes20, p.minCount) * 1.4 + 5;
  const xScale = (n: number) => M.left + (n / maxRange) * innerW;

  const result = Math.max(p.notes20, p.minCount);
  const notes20X = xScale(p.notes20);
  const minCountX = xScale(p.minCount);
  const resultX = xScale(result);

  const lineNotes20 = `
    <line x1="${M.left}" y1="60" x2="${notes20X}" y2="60" stroke="${STAGE_COLORS.note.main}" stroke-width="10" stroke-linecap="round"/>
    <text x="${M.left - 8}" y="64" text-anchor="end" fill="${TEXT}" font-size="11" font-weight="bold">序盤演出区間</text>
    <text x="${notes20X + 6}" y="64" fill="${STAGE_COLORS.note.dark}" font-size="11" font-weight="bold">${p.notes20}</text>
  `;
  const lineMinCount = `
    <line x1="${M.left}" y1="95" x2="${minCountX}" y2="95" stroke="${c.main}" stroke-width="10" stroke-linecap="round"/>
    <text x="${M.left - 8}" y="99" text-anchor="end" fill="${TEXT}" font-size="11" font-weight="bold">最速発動位置</text>
    <text x="${minCountX + 6}" y="99" fill="${c.dark}" font-size="11" font-weight="bold">${p.minCount}</text>
  `;
  const resultLine = `
    <line x1="${resultX}" y1="40" x2="${resultX}" y2="135" stroke="${c.dark}" stroke-width="2" stroke-dasharray="3 3"/>
    <text x="${resultX + 6}" y="130" fill="${c.dark}" font-size="11" font-weight="bold">
      先頭除外 = max(${p.notes20}, ${p.minCount}) = ${result}
    </text>
  `;
  const caseTitle = p.caseLabel
    ? `<text x="${M.left - 10}" y="20" fill="${TEXT}" font-size="12" font-weight="bold">${escapeXml(p.caseLabel)}</text>`
    : '';

  const axis = `
    <line x1="${M.left}" y1="150" x2="${M.left + innerW}" y2="150" stroke="${MUTED}" stroke-width="1"/>
    ${Array.from({ length: 6 }, (_, i) => {
      const n = Math.round((maxRange * i) / 5);
      const x = xScale(n);
      return `<line x1="${x}" y1="150" x2="${x}" y2="154" stroke="${MUTED}"/>
              <text x="${x}" y="166" text-anchor="middle" fill="${MUTED}" font-size="9">${n}</text>`;
    }).join('')}
  `;

  return `${svgOpen(W, H, '先頭除外の計算')}
    ${caseTitle}
    ${axis}
    ${lineNotes20}
    ${lineMinCount}
    ${resultLine}
  </svg>`;
}

export interface CoverageDiagramParams {
  songDuration: number;
  segments: { label: string; seconds: number; color: string }[];
  /** 発動確率 per を織り込んだ期待カバー（下段バー）。省略時は従来の 1 段表示 */
  expected?: {
    segments: { label: string; seconds: number; color: string }[];
    /** エンジンの期待カバー率 (0-1、実効秒数ベース) */
    coverageRate: number;
    effectiveSeconds: number;
  };
}

/** カバー率の合算と 100% キャップの図（expected 指定時は期待カバーの下段バー付き 2 段表示） */
export function coverageDiagramSvg(p: CoverageDiagramParams): string {
  const c = STAGE_COLORS.shrink;
  const hasExpected = p.expected !== undefined;
  const W = 760, H = hasExpected ? 250 : 220;
  const M = { top: 30, right: 20, bottom: 60, left: 20 };
  const innerW = W - M.left - M.right;
  const barH = 40;
  const totalSec = p.segments.reduce((a, s) => a + s.seconds, 0);
  const maxRange = Math.max(totalSec, p.songDuration) * 1.05;
  const xScale = (sec: number) => M.left + (sec / maxRange) * innerW;

  /** セグメント列を積み上げ描画（曲の長さ超過分は破線） */
  const drawSegments = (
    segments: { label: string; seconds: number; color: string }[],
    yTop: number,
  ): string => {
    let cursor = 0;
    return segments.map((s) => {
      const x1 = xScale(cursor);
      const x2Full = xScale(cursor + s.seconds);
      const cappedEnd = Math.min(cursor + s.seconds, p.songDuration);
      const x2Cap = xScale(cappedEnd);
      cursor += s.seconds;

      const inPart = x2Cap > x1
        ? `<rect x="${x1}" y="${yTop}" width="${x2Cap - x1}" height="${barH}"
                fill="${s.color}" opacity="0.9">
             <title>${escapeXml(s.label)} (実効部 ${Math.min(s.seconds, p.songDuration - (cursor - s.seconds))}秒)</title>
           </rect>`
        : '';
      const overPart = x2Full > x2Cap
        ? `<rect x="${x2Cap}" y="${yTop}" width="${x2Full - x2Cap}" height="${barH}"
                fill="${s.color}" opacity="0.3" stroke="${s.color}" stroke-dasharray="4 2" stroke-width="1.5">
             <title>${escapeXml(s.label)} (超過部 = 切り捨て)</title>
           </rect>`
        : '';
      return inPart + overPart;
    }).join('\n');
  };

  /** 曲の長さ背景バー */
  const baseBarAt = (yTop: number, label: string): string => `
    <rect x="${M.left}" y="${yTop}" width="${xScale(p.songDuration) - M.left}" height="${barH}"
          fill="var(--chart-exclude-bg)" stroke="${GRID}" stroke-width="1"/>
    <text x="${M.left}" y="${yTop - 6}"
          fill="${MUTED}" font-size="10">${escapeXml(label)}</text>
  `;

  const fullBarLabel = hasExpected
    ? `全発動できた場合のカバー時間（曲の長さ = ${p.songDuration}秒 = 100%）`
    : `曲の長さ = ${p.songDuration}秒 (100%)`;
  const baseBar = baseBarAt(M.top, fullBarLabel);
  const segmentsSvg = drawSegments(p.segments, M.top);

  const capLabelX = xScale(p.songDuration);
  const capBottom = hasExpected ? M.top + 130 + barH + 6 : M.top + barH + 6;
  const capLine = `
    <line x1="${capLabelX}" y1="${M.top - 4}" x2="${capLabelX}" y2="${capBottom}"
          stroke="${c.dark}" stroke-width="2"/>
    <text x="${capLabelX - 4}" y="${M.top - 6}" text-anchor="end"
          fill="${c.dark}" font-size="10" font-weight="bold">100%→</text>
  `;

  const secTicks: string[] = [];
  for (let s = 0; s <= maxRange; s += 20) {
    const x = xScale(s);
    secTicks.push(
      `<line x1="${x}" y1="${M.top + barH}" x2="${x}" y2="${M.top + barH + 4}" stroke="${MUTED}"/>
       <text x="${x}" y="${M.top + barH + 16}" text-anchor="middle" fill="${MUTED}" font-size="9">${s}s</text>`
    );
  }

  const legendItems = p.segments.map((s, i) =>
    `<g transform="translate(${M.left + i * 320}, ${M.top + barH + 32})">
       <rect width="14" height="10" fill="${s.color}" opacity="0.9"/>
       <text x="18" y="9" fill="${TEXT}" font-size="10">${escapeXml(s.label)} = ${s.seconds}秒</text>
     </g>`
  ).join('\n');

  const rawPct = ((totalSec / p.songDuration) * 100).toFixed(1);
  const cappedPct = Math.min(100, Number(rawPct)).toFixed(1);
  const summary = `
    <text x="${W - M.right}" y="18" text-anchor="end" fill="${TEXT}" font-size="11">
      合算 ${totalSec}秒 / ${p.songDuration}秒 = ${rawPct}% → min(_, 100%) = ${cappedPct}%
    </text>
  `;

  // 下段: 発動確率 per を織り込んだ期待カバー（expected 指定時のみ）
  let expectedBlock = '';
  if (p.expected) {
    const yE = M.top + 130;
    const expTotal = p.expected.segments.reduce((a, s) => a + s.seconds, 0);
    const ratePct = (p.expected.coverageRate * 100).toFixed(1);
    expectedBlock = `
      ${baseBarAt(yE, '発動確率 per を織り込んだ期待カバー')}
      ${drawSegments(p.expected.segments, yE)}
      <text x="${W - M.right}" y="${yE - 6}" text-anchor="end" fill="${c.dark}" font-size="11" font-weight="bold">
        期待 ${expTotal}秒 → 期待カバー率 ${ratePct}%（実効 ${p.expected.effectiveSeconds.toFixed(1)}秒ベース）
      </text>
    `;
  }

  return `${svgOpen(W, H, 'カバー率の合算と 100% キャップ')}
    ${baseBar}
    ${segmentsSvg}
    ${capLine}
    ${secTicks.join('\n')}
    ${summary}
    ${legendItems}
    ${expectedBlock}
  </svg>`;
}

/** 縮小スコア加算式の分解図 */
export function shrinkFormulaSvg(): string {
  const c = STAGE_COLORS.shrink;
  const W = 760, H = 240;
  const formula = `
    <text x="${W / 2}" y="70" text-anchor="middle" fill="${TEXT}"
          font-size="21" font-family="serif">
      ⌊
      <tspan fill="${STAGE_COLORS.note.dark}" font-weight="bold">対象素点合計</tspan>
       × (
      <tspan fill="${c.dark}" font-weight="bold">倍率 − 1.0</tspan>
      ) ×
      <tspan fill="${STAGE_COLORS.final.dark}" font-weight="bold">カバー率</tspan>
      ⌋
    </text>
  `;
  const boxes = [
    { x: 30, y: 110, w: 220, h: 100, color: STAGE_COLORS.note.dark,
      title: '対象素点合計', lines: ['先頭除外の後にある', 'ノーツの素点をすべて合算', '（実装名: eligibleBaseScore）'] },
    { x: 270, y: 110, w: 220, h: 100, color: c.dark,
      title: '倍率 − 1.0', lines: ['縮小倍率から通常分 1.0 を', '引いた「追加分」の倍率', 'Lv1=0.2 / Lv5=0.6'] },
    { x: 510, y: 110, w: 220, h: 100, color: STAGE_COLORS.final.dark,
      title: 'カバー率', lines: ['縮小が効いている時間の割合', '全発動時 = 100% でキャップ', '期待値 = 発動確率込みの期待カバー率'] },
  ];
  const boxSvg = boxes.map((b) =>
    `<g>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" ry="6"
            fill="white" stroke="${b.color}" stroke-width="2"/>
      <text x="${b.x + b.w / 2}" y="${b.y + 24}" text-anchor="middle"
            fill="${b.color}" font-size="14" font-weight="bold">${escapeXml(b.title)}</text>
      ${b.lines.map((l, i) =>
        `<text x="${b.x + b.w / 2}" y="${b.y + 46 + i * 16}" text-anchor="middle"
               fill="${TEXT}" font-size="11">${escapeXml(l)}</text>`
      ).join('')}
    </g>`
  ).join('\n');

  const underlines = boxes.map((b, i) => {
    const cx = 30 + 240 * i + b.w / 2;
    return `<line x1="${cx - 60}" y1="86" x2="${cx + 60}" y2="86" stroke="${b.color}" stroke-width="3"/>`;
  }).join('\n');

  return `${svgOpen(W, H, '縮小スコア加算式')}
    <text x="${W / 2}" y="28" text-anchor="middle" fill="${MUTED}" font-size="11">
      縮小スキルが曲全体に上乗せするスコア（⌊ ⌋ = 最後に 1 回だけ切り捨て）
    </text>
    ${formula}
    ${underlines}
    ${boxSvg}
  </svg>`;
}

/* ================================================================
 * 4-5. 縮小 vs スコアアップの寄与比較（ADR 0044）
 * ================================================================ */

export interface SkillContributionSlot {
  name: string;
  isShrink: boolean;
  expected: number;
  max: number;
}

/** 1 枚あたりのスキル寄与（期待値 + 理論最大・単独想定）の横棒比較図 */
export function skillContributionCompareSvg(slots: SkillContributionSlot[]): string {
  const W = 760;
  const rowH = 46;
  const M = { top: 34, right: 200, bottom: 42, left: 96 };
  const H = M.top + slots.length * rowH + M.bottom;
  const innerW = W - M.left - M.right;
  const maxVal = Math.max(1, ...slots.map(s => s.max));
  const xScale = (v: number) => (v / maxVal) * innerW;

  const rows = slots.map((s, i) => {
    const c = s.isShrink ? STAGE_COLORS.shrink : STAGE_COLORS.scoreUp;
    const y = M.top + i * rowH;
    const barY = y + 8;
    const maxW = xScale(s.max);
    const expW = xScale(s.expected);
    return `<g>
      <text x="${M.left - 8}" y="${barY + 15}" text-anchor="end" fill="${TEXT}" font-size="11">${escapeXml(s.name)}</text>
      <rect x="${M.left}" y="${barY}" width="${maxW}" height="20" rx="3" fill="${c.pale}" stroke="${c.main}" stroke-width="1">
        <title>理論最大 +${fmt(s.max)}（単独想定）</title>
      </rect>
      <rect x="${M.left}" y="${barY}" width="${expW}" height="20" rx="3" fill="${c.main}">
        <title>期待値 +${fmt(s.expected)}</title>
      </rect>
      <text x="${M.left + 4}" y="${barY + 15}" fill="white" font-size="10" font-weight="bold">${s.isShrink ? '縮小' : 'スコアアップ'}</text>
      <text x="${M.left + maxW + 6}" y="${barY + 15}" fill="${MUTED}" font-size="10">期待 +${fmt(s.expected)} / 最大 +${fmt(s.max)}</text>
    </g>`;
  }).join('\n');

  const legendY = M.top + slots.length * rowH + 10;
  const legend = `
    <g transform="translate(${M.left}, ${legendY})">
      <rect width="14" height="10" fill="${STAGE_COLORS.shrink.main}"/>
      <text x="18" y="9" fill="${TEXT}" font-size="10">濃色 = 期待値寄与</text>
      <rect x="130" width="14" height="10" fill="${STAGE_COLORS.shrink.pale}" stroke="${STAGE_COLORS.shrink.main}"/>
      <text x="148" y="9" fill="${TEXT}" font-size="10">淡色 = 理論最大寄与（各スキル単独想定）</text>
    </g>`;

  return `${svgOpen(W, H, 'スキル 1 枚あたりの得点寄与の比較')}
    <text x="${M.left}" y="16" fill="${TEXT}" font-size="12" font-weight="bold">1 枚あたりのスキル得点寄与（デモ編成）</text>
    ${rows}
    ${legend}
  </svg>`;
}

export interface ScalingChartPoint {
  factor: number;
  shrinkExpected: number;
  scoreUpExpected: number;
}

/** チーム属性値の倍率に対するスキル期待値寄与の線グラフ（縮小=比例 / スコアアップ=固定） */
export function skillScalingChartSvg(points: ScalingChartPoint[]): string {
  const W = 760, H = 280;
  const M = { top: 34, right: 190, bottom: 46, left: 70 };
  const innerW = W - M.left - M.right;
  const innerH = H - M.top - M.bottom;
  if (points.length < 2) return `${svgOpen(W, H, '属性値スケーリング比較')}</svg>`;

  const minF = points[0].factor;
  const maxF = points.at(-1)!.factor;
  const maxY = Math.max(...points.map(p => Math.max(p.shrinkExpected, p.scoreUpExpected))) * 1.08;
  const x = (f: number) => M.left + ((f - minF) / (maxF - minF)) * innerW;
  const y = (v: number) => M.top + innerH - (v / maxY) * innerH;

  const line = (key: 'shrinkExpected' | 'scoreUpExpected', color: string) => {
    const pts = points.map(p => `${x(p.factor)},${y(p[key])}`).join(' ');
    const dots = points.map(p =>
      `<circle cx="${x(p.factor)}" cy="${y(p[key])}" r="3.5" fill="${color}"/>`).join('');
    return `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2.5"/>${dots}`;
  };

  const last = points.at(-1)!;
  const xTicks = points.map(p => `
    <line x1="${x(p.factor)}" y1="${M.top + innerH}" x2="${x(p.factor)}" y2="${M.top + innerH + 4}" stroke="${MUTED}"/>
    <text x="${x(p.factor)}" y="${M.top + innerH + 16}" text-anchor="middle" fill="${MUTED}" font-size="10">×${p.factor.toFixed(1)}</text>`).join('');
  const grid = [0.25, 0.5, 0.75, 1].map(r => `
    <line x1="${M.left}" y1="${M.top + innerH * (1 - r)}" x2="${M.left + innerW}" y2="${M.top + innerH * (1 - r)}" stroke="${GRID}" stroke-width="1"/>`).join('');

  return `${svgOpen(W, H, '属性値スケーリング比較')}
    <text x="${M.left}" y="16" fill="${TEXT}" font-size="12" font-weight="bold">チーム属性値が伸びたときのスキル期待値寄与</text>
    ${grid}
    <line x1="${M.left}" y1="${M.top + innerH}" x2="${M.left + innerW}" y2="${M.top + innerH}" stroke="${MUTED}"/>
    ${xTicks}
    <text x="${M.left + innerW / 2}" y="${H - 8}" text-anchor="middle" fill="${MUTED}" font-size="10">チーム属性値の倍率（イベント特効などによる増加の目安）</text>
    ${line('shrinkExpected', STAGE_COLORS.shrink.main)}
    ${line('scoreUpExpected', STAGE_COLORS.scoreUp.main)}
    <text x="${x(last.factor) + 10}" y="${y(last.shrinkExpected) + 4}" fill="${STAGE_COLORS.shrink.dark}" font-size="11" font-weight="bold">判定縮小 +${fmt(last.shrinkExpected)}</text>
    <text x="${x(last.factor) + 10}" y="${y(last.scoreUpExpected) + 4}" fill="${STAGE_COLORS.scoreUp.dark}" font-size="11" font-weight="bold">スコアアップ +${fmt(last.scoreUpExpected)}</text>
  </svg>`;
}

/* ================================================================
 * 5. 最終補正
 * ================================================================ */

export interface FinalBonusParams {
  liveEndScore: number;
  badgeRate: number;
  broachScoreBonus: number;
}

/** 最終補正（バッジ倍率 + ブローチ直接加算）のステップ図（実数値入り） */
export function finalBonusSvg(p: FinalBonusParams): string {
  const c = STAGE_COLORS.final;
  const afterBadge = Math.floor(p.liveEndScore * (1 + p.badgeRate / 100));
  const final = afterBadge + p.broachScoreBonus;

  const W = 820, H = 150;
  const y = 42, h = 64;
  const boxes = [
    { x: 12,  w: 190, title: 'ライブ終了時スコア', value: fmt(p.liveEndScore), pale: false },
    { x: 256, w: 180, title: `× バッジ倍率 (1 + ${p.badgeRate}%)`, value: fmt(afterBadge), pale: false, floorBefore: true },
    { x: 490, w: 170, title: `+ ブローチ直接加算`, value: `+${fmt(p.broachScoreBonus)}`, pale: false },
    { x: 668, w: 140, title: '最終リザルト', value: fmt(final), pale: true },
  ];
  const parts = boxes.map(b => `<g>
      <rect x="${b.x}" y="${y}" width="${b.w}" height="${h}" rx="8" fill="${b.pale ? c.pale : 'white'}" stroke="${c.main}" stroke-width="2"/>
      <text x="${b.x + b.w / 2}" y="${y + 22}" text-anchor="middle" fill="${c.dark}" font-size="11" font-weight="bold">${escapeXml(b.title)}</text>
      <text x="${b.x + b.w / 2}" y="${y + 46}" text-anchor="middle" fill="${TEXT}" font-size="16" font-weight="bold">${b.value}</text>
    </g>`).join('\n');
  const arrows = boxes.slice(0, -1).map((b, i) => {
    const x1 = b.x + b.w, x2 = boxes[i + 1].x;
    const midX = (x1 + x2) / 2;
    const floorMark = boxes[i + 1].floorBefore ? floorBadge(midX, y - 6, c.dark) : '';
    return `<line x1="${x1 + 2}" y1="${y + h / 2}" x2="${x2 - 3}" y2="${y + h / 2}" stroke="${c.main}" stroke-width="2" marker-end="url(#final-arrow)"/>
      ${floorMark}`;
  }).join('\n');

  return `${svgOpen(W, H, '最終補正のステップ')}
    <defs>${arrowDef('final-arrow', c.main)}</defs>
    <text x="12" y="24" fill="${MUTED}" font-size="10">デモ編成の期待値経路での実数値（バッジ ${p.badgeRate}% / ブローチ直接加算はこの編成では ${fmt(p.broachScoreBonus)}）</text>
    ${parts}
    ${arrows}
  </svg>`;
}

/* ================================================================
 * 6. 理論値・期待値・MC
 * ================================================================ */

export interface ScoreRangeParams {
  minScore: number;
  expectedScore: number;
  maxScore: number;
  mcMean: number;
  mcP90: number;
  mcMin: number;
  mcMax: number;
}

/** 理論最低〜最高の数直線上に期待値と MC 統計を配置した図 */
export function scoreRangeSvg(p: ScoreRangeParams): string {
  const W = 820, H = 170;
  const M = { left: 50, right: 50 };
  const innerW = W - M.left - M.right;
  const lineY = 92;
  const span = p.maxScore - p.minScore;
  const x = (v: number) => M.left + ((v - p.minScore) / span) * innerW;

  // MC 分布の帯（mcMin〜mcMax）
  const mcBand = `<rect x="${x(p.mcMin)}" y="${lineY - 12}" width="${x(p.mcMax) - x(p.mcMin)}" height="24"
    fill="${STAGE_COLORS.stats.pale}" stroke="${STAGE_COLORS.stats.main}" stroke-width="1" stroke-dasharray="3 2" rx="4">
    <title>MC 分布の範囲 (${fmt(p.mcMin)} 〜 ${fmt(p.mcMax)})</title></rect>`;

  const markers = [
    { v: p.minScore, label: '理論最低', sub: '全スキル不発', color: STAGE_COLORS.stats.dark, above: true },
    { v: p.expectedScore, label: '期待値', sub: '確率で加重', color: STAGE_COLORS.final.dark, above: true },
    { v: p.mcMean, label: 'MC 平均', sub: `p90=${fmt(p.mcP90)}`, color: ACCENT_RED, above: false },
    { v: p.maxScore, label: '理論最高', sub: '全スキル発動', color: STAGE_COLORS.shrink.dark, above: true },
  ];

  // ラベル・補足・数値は各マーカーの側（above/below）にまとめて縦に積む
  // （期待値と MC 平均のように x が近接しても反対側の要素と交差しない）
  const marks = markers.map(m => {
    const mx = x(m.v);
    const ys = m.above
      ? { sub: lineY - 48, label: lineY - 35, value: lineY - 21 }
      : { value: lineY + 26, label: lineY + 39, sub: lineY + 52 };
    return `<g>
      <line x1="${mx}" y1="${lineY - 16}" x2="${mx}" y2="${lineY + 16}" stroke="${m.color}" stroke-width="2.5"/>
      <text x="${mx}" y="${ys.label}" text-anchor="middle" fill="${m.color}" font-size="11" font-weight="bold">${escapeXml(m.label)}</text>
      <text x="${mx}" y="${ys.sub}" text-anchor="middle" fill="${MUTED}" font-size="9">${escapeXml(m.sub)}</text>
      <text x="${mx}" y="${ys.value}" text-anchor="middle" fill="${TEXT}" font-size="9.5">${fmt(m.v)}</text>
    </g>`;
  }).join('\n');

  return `${svgOpen(W, H, '理論最低・期待値・理論最高スコアの位置関係')}
    <line x1="${M.left}" y1="${lineY}" x2="${M.left + innerW}" y2="${lineY}" stroke="${MUTED}" stroke-width="1.5"/>
    ${mcBand}
    ${marks}
    <text x="${M.left}" y="${H - 4}" fill="${MUTED}" font-size="9.5">グレーの帯（点線）= MC シミュレーションで実際に観測されたスコアの範囲</text>
  </svg>`;
}

/** MC スコア分布のヒストグラム（実データ） */
export function mcHistogramSvg(scores: number[], mean: number): string {
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  return renderHistogramSvg(scores, min, max, mean, {
    xAxisLabel: 'スコア (MC 1000 試行)',
    barColor: STAGE_COLORS.stats.main,
  });
}

/* ================================================================
 * 章末: 積み上げスコアバー
 * ================================================================ */

export interface AccumulationStage {
  label: string;
  value: number;
  stage: StageKey;
}

export interface AccumulationBarParams {
  stages: AccumulationStage[];
  /** 何段目まで「確定」表示するか (1-based)。それ以降は薄く表示 */
  activeCount: number;
}

/** 章末に置く「ここまでの積み上げスコア」バー */
export function accumulationBarSvg(p: AccumulationBarParams): string {
  const W = 760, H = 96;
  const M = { top: 30, left: 16, right: 16 };
  const barH = 26;
  const innerW = W - M.left - M.right;
  const total = p.stages.reduce((a, s) => a + s.value, 0);
  const activeTotal = p.stages.slice(0, p.activeCount).reduce((a, s) => a + s.value, 0);

  let x = M.left;
  const segs = p.stages.map((s, i) => {
    const w = (s.value / total) * innerW;
    const active = i < p.activeCount;
    const color = STAGE_COLORS[s.stage].main;
    const rect = `<g opacity="${active ? 1 : 0.18}">
      <rect x="${x}" y="${M.top}" width="${w}" height="${barH}" fill="${color}">
        <title>${escapeXml(s.label)}: +${fmt(s.value)}</title></rect>
      ${w > 60 ? `<text x="${x + w / 2}" y="${M.top + barH / 2 + 3.5}" text-anchor="middle" fill="white" font-size="9.5" font-weight="bold">${escapeXml(s.label)}</text>` : ''}
    </g>`;
    const below = `<text x="${Math.min(Math.max(x + w / 2, M.left + 30), W - M.right - 30)}" y="${M.top + barH + 16}" text-anchor="middle" fill="${active ? TEXT : MUTED}" font-size="9" opacity="${active ? 1 : 0.5}">+${fmt(s.value)}</text>`;
    x += w;
    return rect + below;
  }).join('\n');

  const cursorX = M.left + (activeTotal / total) * innerW;
  const cursor = p.activeCount < p.stages.length
    ? `<line x1="${cursorX}" y1="${M.top - 8}" x2="${cursorX}" y2="${M.top + barH + 6}" stroke="${TEXT}" stroke-width="2"/>
       <text x="${Math.min(cursorX, W - 120)}" y="${M.top - 12}" text-anchor="middle" fill="${TEXT}" font-size="11" font-weight="bold">ここまで ${fmt(activeTotal)}</text>`
    : `<text x="${W - M.right}" y="${M.top - 12}" text-anchor="end" fill="${STAGE_COLORS.final.dark}" font-size="12" font-weight="bold">最終 ${fmt(total)}</text>`;

  return `${svgOpen(W, H, 'ここまでの積み上げスコア')}
    ${segs}
    ${cursor}
  </svg>`;
}
