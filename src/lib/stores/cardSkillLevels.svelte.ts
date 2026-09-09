import { loadJson, saveJson, STORAGE_KEYS } from '../storage';
import type { SkillLevel } from '../score/deckState';

/** 衣装 ID → 1 枚ごとのスキル Lv（配列の i 番目 = i 枚目）。全て 5 のキーは保存しない */
type LevelMap = Record<string, SkillLevel[]>;

const DEFAULT_LEVEL: SkillLevel = 5;

const levels = $state<LevelMap>(
  typeof window === 'undefined' ? {} : loadJson<LevelMap>(STORAGE_KEYS.CARD_SKILL_LEVELS, {}),
);

function isSkillLevel(v: unknown): v is SkillLevel {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/** 保存配列を count 件に切り詰め、足りない分は 5 で埋める（長さは常に count） */
export function getLevels(cardId: number | string, count: number): SkillLevel[] {
  const saved = levels[String(cardId)] ?? [];
  return Array.from({ length: Math.max(0, count) }, (_, i) => {
    const lv = saved[i];
    return isSkillLevel(lv) ? lv : DEFAULT_LEVEL;
  });
}

/** index 枚目の Lv を更新する。全て 5 になったらキーごと削除する */
export function setLevel(cardId: number | string, index: number, lv: SkillLevel): void {
  if (!isSkillLevel(lv) || index < 0) return;
  const key = String(cardId);
  const next = getLevels(key, Math.max(index + 1, (levels[key] ?? []).length));
  next[index] = lv;
  if (next.every((v) => v === DEFAULT_LEVEL)) {
    delete levels[key];
  } else {
    levels[key] = next;
  }
  saveJson(STORAGE_KEYS.CARD_SKILL_LEVELS, levels);
}

/** 計算側が使う降順の Lv 配列 */
export function sortedLevels(cardId: number | string, count: number): SkillLevel[] {
  return getLevels(cardId, count).toSorted((a, b) => b - a);
}

/** localStorage の最新内容に同期し、消えたキーは落とす（バックアップ取り込み後・他タブ更新後に使う） */
export function reloadSkillLevelsFromStorage(): void {
  const fresh = loadJson<LevelMap>(STORAGE_KEYS.CARD_SKILL_LEVELS, {});
  for (const key of Object.keys(levels)) {
    if (!(key in fresh)) delete levels[key];
  }
  for (const [k, v] of Object.entries(fresh)) {
    levels[k] = v;
  }
}
