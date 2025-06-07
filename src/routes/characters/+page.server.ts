import type { PageServerLoad } from './$types';
import { getCharacterStats } from '$lib/db';

export const load: PageServerLoad = async () => {
  const characters = await getCharacterStats();
  
  return {
    characters
  };
};