import type { PageServerLoad } from './$types';
import { getCards, getTotalCardCount } from '$lib/db';

export const load: PageServerLoad = async ({ url }) => {
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = 50;
  const offset = (page - 1) * limit;
  
  const [cards, totalCards] = await Promise.all([
    getCards(limit, offset),
    getTotalCardCount()
  ]);
  
  return {
    cards,
    totalCards,
    currentPage: page
  };
};