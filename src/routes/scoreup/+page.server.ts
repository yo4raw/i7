import type { PageServerLoad } from './$types';
import { searchScoreUpCards, getDistinctYears, getDistinctSkillTypes, getCharacters, type ScoreUpSearchParams } from '$lib/db';

export const load: PageServerLoad = async ({ url }) => {
  // Get query parameters
  const name = url.searchParams.get('name') || undefined;
  const rarity = url.searchParams.getAll('rarity').filter(r => r);
  const attribute = url.searchParams.getAll('attribute').map(a => parseInt(a)).filter(a => !isNaN(a));
  const skillLevel = url.searchParams.get('skillLevel') ? parseInt(url.searchParams.get('skillLevel')!) : undefined;
  const year = url.searchParams.get('year') ? parseInt(url.searchParams.get('year')!) : undefined;
  const characterIds = url.searchParams.getAll('character').map(c => parseInt(c)).filter(c => !isNaN(c));
  const costumeName = url.searchParams.get('costume') || undefined;
  const skillActivationType = url.searchParams.get('activationType') || undefined;
  const skillType = url.searchParams.getAll('skillType').filter(s => s);
  const eventBonus = url.searchParams.get('eventBonus') === 'true';
  
  const searchParams: ScoreUpSearchParams = {
    name,
    rarity: rarity.length > 0 ? rarity : undefined,
    attribute: attribute.length > 0 ? attribute : undefined,
    skillLevel,
    year,
    characterIds: characterIds.length > 0 ? characterIds : undefined,
    costumeName,
    skillActivationType,
    skillType: skillType.length > 0 ? skillType : undefined,
    eventBonus: eventBonus || undefined
  };
  
  const [cards, years, skillTypes, characters] = await Promise.all([
    searchScoreUpCards(searchParams),
    getDistinctYears(),
    getDistinctSkillTypes(),
    getCharacters()
  ]);
  
  return {
    cards,
    years,
    skillTypes,
    characters,
    searchParams
  };
};