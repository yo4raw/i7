export const NOTE_RATE = { white: 0.025, color: 0.030 } as const;

export const LIGHT_MULTIPLIER: Record<string, number> = {
  notes_20: 1.0,
  light_2: 1.1,
  light_3: 1.2,
  light_4: 1.3,
  light_5: 1.4,
  light_6: 1.5,
  chorus_light_5: 2.6,
  chorus_light_6: 3.0,
};

export const SHRINK_MULTIPLIER = 1.6;
export const MC_ITERATIONS = 1000;
export const MC_CHUNK_SIZE = 50;
export const CENTER_FRIEND_BONUS_RATE = 10;
