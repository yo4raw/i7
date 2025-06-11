import { s as searchScoreUpCards, c as getDistinctYears, d as getDistinctSkillTypes, e as getCharacters } from "../../../chunks/queries.js";
const load = async ({ url }) => {
  const name = url.searchParams.get("name") || void 0;
  const rarity = url.searchParams.getAll("rarity").filter((r) => r);
  const attribute = url.searchParams.getAll("attribute").map((a) => parseInt(a)).filter((a) => !isNaN(a));
  const skillLevel = url.searchParams.get("skillLevel") ? parseInt(url.searchParams.get("skillLevel")) : void 0;
  const year = url.searchParams.get("year") ? parseInt(url.searchParams.get("year")) : void 0;
  const characterIds = url.searchParams.getAll("character").map((c) => parseInt(c)).filter((c) => !isNaN(c));
  const costumeName = url.searchParams.get("costume") || void 0;
  const skillActivationType = url.searchParams.get("activationType") || void 0;
  const skillType = url.searchParams.getAll("skillType").filter((s) => s);
  const eventBonus = url.searchParams.get("eventBonus") === "true";
  const searchParams = {
    name,
    rarity: rarity.length > 0 ? rarity : void 0,
    attribute: attribute.length > 0 ? attribute : void 0,
    skillLevel,
    year,
    characterIds: characterIds.length > 0 ? characterIds : void 0,
    costumeName,
    skillActivationType,
    skillType: skillType.length > 0 ? skillType : void 0,
    eventBonus: eventBonus || void 0
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
export {
  load
};
