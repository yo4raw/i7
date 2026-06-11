/**
 * 共通ブローチ所持数と装備状況の突合ヘルパ。
 * 所持制約の対象は自チーム 5 枠 (slot 0-4) のみ。フレンド枠 (slot 5) は対象外。
 */

/** slot 0-4 で使用中の共通ブローチ個数を broachId ごとに数える */
export function countUsedBroachs(
  sharedBroachs: number[][],
  excludeSlot?: number,
  excludeIdx?: number,
): Map<number, number> {
  const used = new Map<number, number>();
  for (let slot = 0; slot <= 4; slot++) {
    const arr = sharedBroachs[slot] ?? [];
    for (let idx = 0; idx < arr.length; idx++) {
      if (slot === excludeSlot && idx === excludeIdx) continue;
      const id = arr[idx];
      if (!id) continue;
      used.set(id, (used.get(id) ?? 0) + 1);
    }
  }
  return used;
}

/** 所持数を超過して装備されている broachId のリスト (slot 0-4 のみ対象) */
export function broachViolations(
  sharedBroachs: number[][],
  counts: Record<string, number>,
): number[] {
  const over: number[] = [];
  for (const [id, n] of countUsedBroachs(sharedBroachs)) {
    if (n > (counts[String(id)] ?? 0)) over.push(id);
  }
  return over;
}
