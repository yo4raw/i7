import type { PageServerLoad } from './$types';
import { getCards, getTotalCardCount, getRarityStats, getCharacterStats } from '$lib/db';

export const load: PageServerLoad = async () => {
  const [totalCards, rarityStats, characterStats, recentCards] = await Promise.all([
    getTotalCardCount(),
    getRarityStats(),
    getCharacterStats(),
    getCards(8, 0) // Get 8 most recent cards
  ]);

  return {
    totalCards,
    rarityStats,
    characterStats,
    recentCards
  };
};