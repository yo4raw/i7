import { describe, it, expect } from 'vitest';
import { STORAGE_KEYS } from '../../../src/lib/storage';

describe('ポイント芸計算ツールの localStorage キー', () => {
  it('STORAGE_KEYS に登録されている（FooterTools のバックアップ対象に含めるため）', () => {
    expect(STORAGE_KEYS.POINT_CALC_STATE).toBe('i7_point_calc_state');
  });
});
