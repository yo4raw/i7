import { STORAGE_KEYS, loadJson, saveJson } from '../storage';

export interface RabbitNoteEntry {
  shout: number;
  beat: number;
  melody: number;
}

/** キャラクター名 → { shout, beat, melody } */
export type RabbitNoteMap = Record<string, RabbitNoteEntry>;

export function loadRabbitNotes(): RabbitNoteMap {
  return loadJson<RabbitNoteMap>(STORAGE_KEYS.RABBIT_NOTES, {});
}

export function saveRabbitNotes(notes: RabbitNoteMap): void {
  saveJson(STORAGE_KEYS.RABBIT_NOTES, notes);
}
