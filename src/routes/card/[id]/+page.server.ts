import type { PageServerLoad } from './$types';
import { getCardById } from '$lib/db';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const id = parseInt(params.id);
  
  if (isNaN(id)) {
    throw error(400, 'Invalid card ID');
  }
  
  const card = await getCardById(id);
  
  if (!card) {
    throw error(404, 'Card not found');
  }
  
  return {
    card
  };
};