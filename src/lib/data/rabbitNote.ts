export interface RabbitNoteEntry {
  shout: number;
  beat: number;
  melody: number;
}

/** キャラクター名 → { shout, beat, melody } */
export type RabbitNoteMap = Record<string, RabbitNoteEntry>;

const STORAGE_KEY = 'i7_rabbit_notes';

export function loadRabbitNotes(): RabbitNoteMap {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch { return {}; }
}

export function saveRabbitNotes(notes: RabbitNoteMap): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(notes)); } catch {}
}
