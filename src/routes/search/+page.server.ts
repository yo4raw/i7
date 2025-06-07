import type { PageServerLoad } from './$types';
import { searchCards, getCardsByRarity, getCardsByCharacter, getCardsByAttribute, getRarityStats, getCharacterStats } from '$lib/db';

export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get('q') || '';
  const rarity = url.searchParams.get('rarity') || '';
  const character = url.searchParams.get('character') || '';
  const attribute = url.searchParams.get('attribute') || '';
  
  let results = null;
  
  // Perform search if any parameter is provided
  if (query || rarity || character || attribute) {
    if (query) {
      results = await searchCards(query);
    } else if (character) {
      results = await getCardsByCharacter(character);
    } else if (rarity) {
      results = await getCardsByRarity(rarity);
    } else if (attribute) {
      results = await getCardsByAttribute(parseInt(attribute));
    }
    
    // Apply additional filters if multiple criteria are specified
    if (results && rarity && !query) {
      results = results.filter((card: any) => card.rarity === rarity);
    }
    if (results && attribute && !query) {
      results = results.filter((card: any) => card.attribute === parseInt(attribute));
    }
  }
  
  // Get filter options
  const [rarities, characters] = await Promise.all([
    getRarityStats(),
    getCharacterStats()
  ]);
  
  return {
    results,
    rarities,
    characters,
    query,
    selectedRarity: rarity,
    selectedCharacter: character,
    selectedAttribute: attribute
  };
};