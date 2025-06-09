import type { PageServerLoad } from './$types';
import { getSongs } from '$lib/db/queries';

export const load: PageServerLoad = async () => {
  const songs = await getSongs();
  
  return {
    songs
  };
};