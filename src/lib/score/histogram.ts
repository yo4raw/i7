/**
 * SVG ヒストグラム描画ユーティリティ
 *
 * MC シミュレーション結果のスコア分布を可視化する。
 */

const CHART_WIDTH = 500;
const CHART_HEIGHT = 200;
const MARGIN = { top: 20, right: 20, bottom: 40, left: 50 };
const INNER_WIDTH = CHART_WIDTH - MARGIN.left - MARGIN.right;
const INNER_HEIGHT = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;
const BIN_COUNT = 25;

export function renderHistogramSvg(
  scores: number[],
  minScore: number,
  maxScore: number,
  mean: number,
): string {
  if (scores.length === 0 || maxScore <= minScore) {
    return '<span class="text-gray-400 text-xs">データなし</span>';
  }

  const range = maxScore - minScore;
  const binWidth = range / BIN_COUNT;
  const bins = new Array<number>(BIN_COUNT).fill(0);

  for (const s of scores) {
    let idx = Math.floor((s - minScore) / binWidth);
    if (idx < 0) idx = 0;
    if (idx >= BIN_COUNT) idx = BIN_COUNT - 1;
    bins[idx]++;
  }

  const maxCount = Math.max(...bins);
  if (maxCount === 0) {
    return '<span class="text-gray-400 text-xs">データなし</span>';
  }

  const barW = INNER_WIDTH / BIN_COUNT;

  // バーの描画
  const bars = bins.map((count, i) => {
    const barH = (count / maxCount) * INNER_HEIGHT;
    const x = MARGIN.left + i * barW;
    const y = MARGIN.top + INNER_HEIGHT - barH;
    const binStart = Math.round(minScore + i * binWidth);
    const binEnd = Math.round(minScore + (i + 1) * binWidth);
    return `<rect x="${x}" y="${y}" width="${barW - 1}" height="${barH}" fill="#6366f1" opacity="0.8">
      <title>${binStart.toLocaleString()}〜${binEnd.toLocaleString()}: ${count}回</title>
    </rect>`;
  }).join('\n    ');

  // 平均値マーカー
  const meanX = MARGIN.left + ((mean - minScore) / range) * INNER_WIDTH;
  const meanLine = `<line x1="${meanX}" y1="${MARGIN.top}" x2="${meanX}" y2="${MARGIN.top + INNER_HEIGHT}" stroke="#ef4444" stroke-width="2"/>
    <text x="${meanX}" y="${MARGIN.top - 4}" text-anchor="middle" fill="#ef4444" font-size="9">平均</text>`;

  // X軸ラベル
  const labelCount = 5;
  const xLabels = Array.from({ length: labelCount + 1 }, (_, i) => {
    const val = minScore + (range * i) / labelCount;
    const x = MARGIN.left + (INNER_WIDTH * i) / labelCount;
    const label = Math.round(val).toLocaleString();
    return `<text x="${x}" y="${MARGIN.top + INNER_HEIGHT + 16}" text-anchor="middle" fill="#6b7280" font-size="9">${label}</text>`;
  }).join('\n    ');

  // Y軸ラベル
  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks + 1 }, (_, i) => {
    const count = Math.round((maxCount * i) / yTicks);
    const y = MARGIN.top + INNER_HEIGHT - (INNER_HEIGHT * i) / yTicks;
    return `<text x="${MARGIN.left - 6}" y="${y + 3}" text-anchor="end" fill="#6b7280" font-size="9">${count}</text>`;
  }).join('\n    ');

  // 軸線
  const axes = `<line x1="${MARGIN.left}" y1="${MARGIN.top + INNER_HEIGHT}" x2="${MARGIN.left + INNER_WIDTH}" y2="${MARGIN.top + INNER_HEIGHT}" stroke="#d1d5db" stroke-width="1"/>
    <line x1="${MARGIN.left}" y1="${MARGIN.top}" x2="${MARGIN.left}" y2="${MARGIN.top + INNER_HEIGHT}" stroke="#d1d5db" stroke-width="1"/>`;

  // 軸ラベル
  const axisLabels = `<text x="${CHART_WIDTH / 2}" y="${CHART_HEIGHT - 2}" text-anchor="middle" fill="#6b7280" font-size="10">スコア</text>
    <text x="12" y="${CHART_HEIGHT / 2}" text-anchor="middle" fill="#6b7280" font-size="10" transform="rotate(-90 12 ${CHART_HEIGHT / 2})">度数</text>`;

  return `<svg viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" class="w-full h-auto" xmlns="http://www.w3.org/2000/svg">
    ${axes}
    ${bars}
    ${meanLine}
    ${xLabels}
    ${yLabels}
    ${axisLabels}
  </svg>`;
}
