import type { PageServerLoad } from './$types';
import { getRarityStats, getTotalCardCount } from '$lib/db';

export const load: PageServerLoad = async () => {
  const [rarities, totalCards] = await Promise.all([
    getRarityStats(),
    getTotalCardCount()
  ]);
  
  return {
    rarities,
    totalCards
  };
};