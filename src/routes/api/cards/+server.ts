import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getCards, searchCards } from '$lib/db';

export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get('q');
  const limit = parseInt(url.searchParams.get('limit') || '50');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  
  try {
    let cards;
    
    if (query) {
      cards = await searchCards(query);
    } else {
      cards = await getCards(limit, offset);
    }
    
    return json({
      success: true,
      data: cards,
      count: cards.length
    });
  } catch (error) {
    return json({
      success: false,
      error: 'Failed to fetch cards'
    }, { status: 500 });
  }
};