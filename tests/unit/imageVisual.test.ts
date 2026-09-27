import { describe, it, expect } from 'vitest';
import { cardVisualEntry, songVisualEntry } from '../../src/lib/imageVisual';

// image-visual.json の実データを使わず、load() の返す catalog を差し替える
// ためにモジュールをモックする代わりに、実ファイルを読む形で境界だけを検証する

describe('imageVisual', () => {
  it('cardVisualEntry: 存在する ID で VisualEntry を返す', () => {
    // 実際の catalog に存在する ID を使う（1000 は確実に存在する）
    const entry = cardVisualEntry('1000');
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty('v');
    expect(typeof entry!.v).toBe('string');
  });

  it('cardVisualEntry: 存在しない ID は undefined', () => {
    expect(cardVisualEntry('999999')).toBeUndefined();
    expect(cardVisualEntry('nonexistent')).toBeUndefined();
  });

  it('songVisualEntry: 存在する ID で VisualEntry を返す', () => {
    const entry = songVisualEntry('1');
    expect(entry).toBeDefined();
    expect(entry).toHaveProperty('v');
    expect(typeof entry!.v).toBe('string');
  });

  it('songVisualEntry: 存在しない ID は undefined', () => {
    expect(songVisualEntry('999999')).toBeUndefined();
  });
});
