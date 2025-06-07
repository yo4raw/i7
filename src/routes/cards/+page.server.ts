import { getCards, getTotalCardCount } from '$lib/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
  const [cards, totalCount] = await Promise.all([
    getCards(10000, 0),  // 大きな数値を設定してすべてのカードを取得
    getTotalCardCount()
  ]);
  
  return {
    cards,
    totalCount
  };
};