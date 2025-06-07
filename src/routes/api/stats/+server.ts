import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTotalCardCount, getRarityStats, getCharacterStats } from '$lib/db';

export const GET: RequestHandler = async () => {
  try {
    const [totalCards, rarityStats, characterStats] = await Promise.all([
      getTotalCardCount(),
      getRarityStats(),
      getCharacterStats()
    ]);
    
    return json({
      success: true,
      data: {
        totalCards,
        rarityStats,
        characterStats
      }
    });
  } catch (error) {
    return json({
      success: false,
      error: 'Failed to fetch statistics'
    }, { status: 500 });
  }
};