import { neon } from '@neondatabase/serverless';
import { DATABASE_URL } from '$env/static/private';

export const sql = neon(DATABASE_URL);

export interface Card {
  id: number;
  card_id: number;
  cardname: string;
  name: string;
  name_other: string;
  groupname: string;
  rarity: string;
  get_type: string;
  story: string;
  awakening_item: number;
}

export interface CardStats {
  id: number;
  attribute: number;
  shout_min: number;
  shout_max: number;
  beat_min: number;
  beat_max: number;
  melody_min: number;
  melody_max: number;
}

export interface CardSkills {
  id: number;
  ap_skill_type: string;
  ap_skill_req: number;
  ap_skill_name: string;
  ct_skill: number;
  sp_time: number;
  sp_value: number;
}

export interface SkillDetails {
  id: number;
  card_id: number;
  skill_level: number;
  count: number;
  per: number;
  value: number;
  rate: number;
}

export interface ReleaseInfo {
  id: number;
  year: number;
  month: number;
  day: number;
  event: string;
}

export async function getCards(limit: number = 50, offset: number = 0) {
  const result = await sql`
    SELECT * FROM i7card.cards 
    ORDER BY id DESC 
    LIMIT ${limit} OFFSET ${offset}
  `;
  return result as Card[];
}

export async function getCardById(id: number) {
  const result = await sql`
    SELECT 
      c.*,
      cs.attribute,
      cs.shout_min, cs.shout_max,
      cs.beat_min, cs.beat_max,
      cs.melody_min, cs.melody_max,
      csk.ap_skill_type, csk.ap_skill_req, csk.ap_skill_name,
      csk.ct_skill, csk.sp_time, csk.sp_value,
      ri.year, ri.month, ri.day, ri.event
    FROM i7card.cards c
    LEFT JOIN i7card.card_stats cs ON c.id = cs.id
    LEFT JOIN i7card.card_skills csk ON c.id = csk.id
    LEFT JOIN i7card.release_info ri ON c.id = ri.id
    WHERE c.id = ${id}
  `;
  return result[0];
}

export async function getSkillDetails(cardId: number) {
  const result = await sql`
    SELECT * FROM i7card.skill_details 
    WHERE card_id = ${cardId}
    ORDER BY skill_level
  `;
  return result as SkillDetails[];
}

export async function searchCards(query: string) {
  const searchTerm = `%${query}%`;
  const result = await sql`
    SELECT * FROM i7card.cards 
    WHERE 
      cardname ILIKE ${searchTerm} OR 
      name ILIKE ${searchTerm} OR 
      groupname ILIKE ${searchTerm}
    ORDER BY id DESC
    LIMIT 100
  `;
  return result as Card[];
}

export async function getCardsByRarity(rarity: string) {
  const result = await sql`
    SELECT * FROM i7card.cards 
    WHERE rarity = ${rarity}
    ORDER BY id DESC
  `;
  return result as Card[];
}

export async function getCardsByCharacter(name: string) {
  const result = await sql`
    SELECT * FROM i7card.cards 
    WHERE name = ${name}
    ORDER BY id DESC
  `;
  return result as Card[];
}

export async function getCardsByAttribute(attribute: number) {
  const result = await sql`
    SELECT c.*, cs.attribute
    FROM i7card.cards c
    JOIN i7card.card_stats cs ON c.id = cs.id
    WHERE cs.attribute = ${attribute}
    ORDER BY c.id DESC
  `;
  return result as Card[];
}

export async function getTotalCardCount() {
  const result = await sql`
    SELECT COUNT(*) as count FROM i7card.cards
  `;
  return result[0].count;
}

export async function getRarityStats() {
  const result = await sql`
    SELECT rarity, COUNT(*) as count
    FROM i7card.cards
    GROUP BY rarity
    ORDER BY count DESC
  `;
  return result;
}

export async function getCharacterStats() {
  const result = await sql`
    SELECT name, COUNT(*) as count
    FROM i7card.cards
    GROUP BY name
    ORDER BY count DESC
  `;
  return result;
}