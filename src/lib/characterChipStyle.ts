import { CHROME_INK, characterColor } from './constants';

/**
 * キャラクターフィルタチップの選択時スタイル計算 (ADR 0047)。
 *
 * 16 色は明度がばらばらなので、塗り色に対して文字が WCAG AA (4.5:1) を満たすよう
 * 実測コントラスト比に基づき個別に調整している。判断の経緯・実測値は
 * `.superpowers/sdd/2026-07-29-character-color-identity/task-6-report.md` 参照。
 *
 * - 既定: 塗り = キャラ色そのもの、文字 = 近黒 CHROME_INK
 * - CHIP_TEXT_OVERRIDE: 近黒では 4.5:1 未満だが白文字なら満たす色 → 文字を白に
 * - CHIP_DILUTED: 近黒・白のどちらでも 4.5:1 に届かない色 → 塗りを白でごくわずかに薄め、
 *   境界線のみ原色を残して近黒文字を載せる（原色の質感を保つため希釈は最小限に留める）
 *
 * `tests/unit/characterChipStyle.test.ts` で 16 色すべての実効コントラストを検証している。
 * この 2 つの定数と希釈率を変更した場合は、そのテストが通ることを確認すること。
 */
export const CHIP_TEXT_OVERRIDE: Record<string, string> = {
  和泉一織: '#FFFFFF',
  十龍之介: '#FFFFFF',
  狗丸トウマ: '#FFFFFF',
};

/**
 * 希釈対象の色と希釈率（`color-mix(in srgb, {色} N%, white)` の N。原色の割合、0-100）。
 * N は AA (4.5:1) を満たす最小値より安全マージンを持たせた値にすること。
 */
export const CHIP_DILUTED: Record<string, number> = {
  逢坂壮五: 88,
  七瀬陸: 88,
};

/** キャラクターフィルタチップの選択時 inline style 文字列を組み立てる */
export function chipActiveStyle(name: string): string {
  const hex = characterColor(name);
  const dilutePct = CHIP_DILUTED[name];
  if (dilutePct !== undefined) {
    return `background-color:color-mix(in srgb, ${hex} ${dilutePct}%, white);border-color:${hex};color:${CHROME_INK}`;
  }
  const textColor = CHIP_TEXT_OVERRIDE[name] ?? CHROME_INK;
  return `background-color:${hex};border-color:${hex};color:${textColor}`;
}
