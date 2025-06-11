// @ts-nocheck
import type { PageServerLoad } from './$types';
import { getSongs } from '$lib/db/queries';

export const load = async () => {
  const songs = await getSongs();
  
  return {
    songs
  };
};;null as any as PageServerLoad;