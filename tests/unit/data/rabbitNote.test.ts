// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadRabbitNotes, saveRabbitNotes } from '../../../src/lib/data/rabbitNote';
import { STORAGE_KEYS } from '../../../src/lib/storage';

beforeEach(() => localStorage.clear());

describe('rabbitNote', () => {
  it('未保存なら空オブジェクト', () => {
    expect(loadRabbitNotes()).toEqual({});
  });

  it('保存した内容を読み戻せる', () => {
    const notes = { 七瀬陸: { shout: 1, beat: 2, melody: 3 } };
    saveRabbitNotes(notes);
    expect(localStorage.getItem(STORAGE_KEYS.RABBIT_NOTES)).not.toBeNull();
    expect(loadRabbitNotes()).toEqual(notes);
  });
});
