import type { Card } from '../../src/lib/data/fetchCardsJson';
import type { Song } from '../../src/lib/data/fetchSongsJson';

import tamakiJson from './10th-tamaki-main.json' with { type: 'json' };
import monsterJson from './monster-generation.json' with { type: 'json' };

export const tenthTamakiMainCard = tamakiJson as unknown as Card;
export const monsterGenerationSong = monsterJson as unknown as Song;
