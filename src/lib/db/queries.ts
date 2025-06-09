import { eq, desc, ilike, or, and, inArray, sql, count } from 'drizzle-orm';
import { getDb } from './drizzle';
import * as schema from './schema';

// Re-export types from schema
export type { Card, CardStats, CardSkills, SkillDetail, ReleaseInfo, BroachInfo, Song, TeamComposition } from './schema';

// Combined card type with all relations
export interface CardWithDetails extends schema.Card {
  stats?: schema.CardStats | null;
  skills?: schema.CardSkills | null;
  skillDetails?: schema.SkillDetail[];
  releaseInfo?: schema.ReleaseInfo | null;
  broachInfo?: schema.BroachInfo | null;
}

export async function getCards(limit = 50, offset = 0): Promise<CardWithDetails[]> {
  try {
    const db = getDb();
    
    // Get regular cards
    const regularCards = await db
      .select()
      .from(schema.cards)
      .leftJoin(schema.cardStats, eq(schema.cards.id, schema.cardStats.id))
      .leftJoin(schema.cardSkills, eq(schema.cards.id, schema.cardSkills.id))
      .orderBy(desc(schema.cards.id))
      .limit(limit)
      .offset(offset);
    
    // Get group cards - fetch all group cards if limit is large
    const groupCardLimit = limit > 1000 ? 1000 : Math.floor(limit / 5);
    const groupCardsResult = await db
      .select()
      .from(schema.groupCards)
      .orderBy(desc(schema.groupCards.id))
      .limit(groupCardLimit)
      .offset(0);
    
    // Transform regular cards
    const transformedRegularCards = regularCards.map(row => ({
      ...row.cards,
      // Add snake_case versions for backward compatibility
      card_id: row.cards.cardId,
      name_other: row.cards.nameOther,
      get_type: row.cards.getType,
      awakening_item: row.cards.awakeningItem,
      // From stats
      attribute: row.card_stats?.attribute,
      shout_min: row.card_stats?.shoutMin,
      shout_max: row.card_stats?.shoutMax,
      beat_min: row.card_stats?.beatMin,
      beat_max: row.card_stats?.beatMax,
      melody_min: row.card_stats?.melodyMin,
      melody_max: row.card_stats?.melodyMax,
      // From skills
      ap_skill_type: row.card_skills?.apSkillType,
      ap_skill_req: row.card_skills?.apSkillReq,
      ap_skill_name: row.card_skills?.apSkillName,
      ct_skill: row.card_skills?.ctSkill,
      sp_time: row.card_skills?.spTime,
      sp_value: row.card_skills?.spValue,
      is_group_card: false,
    }));
    
    // Transform group cards to match card interface
    const transformedGroupCards = groupCardsResult.map(gc => ({
      id: gc.id,
      card_id: gc.cardId,
      cardId: gc.cardId,
      cardname: gc.cardname,
      name: gc.groupName,
      name_other: gc.members,
      nameOther: gc.members,
      groupname: gc.groupType,
      rarity: 'GROUP',  // Special rarity for group cards
      get_type: 'グループ',
      getType: 'グループ',
      attribute: gc.attribute,
      shout_max: gc.shoutValue,
      beat_max: gc.beatValue,
      melody_max: gc.melodyValue,
      is_group_card: true,
      broach_type: gc.broachType,
    }));
    
    // For large limits, interleave group cards throughout the results
    // For small limits, just combine and sort
    let allCards: any[];
    
    if (limit > 100 && transformedGroupCards.length > 0) {
      // Interleave group cards every N regular cards
      const interleaveRatio = Math.floor(transformedRegularCards.length / transformedGroupCards.length);
      allCards = [];
      let groupIndex = 0;
      
      for (let i = 0; i < transformedRegularCards.length; i++) {
        allCards.push(transformedRegularCards[i]);
        
        // Add a group card every N regular cards
        if ((i + 1) % interleaveRatio === 0 && groupIndex < transformedGroupCards.length) {
          allCards.push(transformedGroupCards[groupIndex]);
          groupIndex++;
        }
      }
      
      // Add any remaining group cards
      while (groupIndex < transformedGroupCards.length) {
        allCards.push(transformedGroupCards[groupIndex]);
        groupIndex++;
      }
      
      allCards = allCards.slice(0, limit);
    } else {
      // For small limits, just combine and sort normally
      allCards = [...transformedRegularCards, ...transformedGroupCards]
        .sort((a, b) => b.id - a.id)
        .slice(0, limit);
    }
    
    return allCards as any[];
  } catch (error) {
    console.error('Error fetching cards:', error);
    return [];
  }
}

export async function getCardById(id: number): Promise<CardWithDetails | null> {
  try {
    const db = getDb();
    
    // Get main card data with all related tables
    const cardResult = await db
      .select()
      .from(schema.cards)
      .leftJoin(schema.cardStats, eq(schema.cards.id, schema.cardStats.id))
      .leftJoin(schema.cardSkills, eq(schema.cards.id, schema.cardSkills.id))
      .leftJoin(schema.releaseInfo, eq(schema.cards.id, schema.releaseInfo.id))
      .leftJoin(schema.broachInfo, eq(schema.cards.id, schema.broachInfo.id))
      .where(eq(schema.cards.id, id))
      .limit(1);
    
    if (!cardResult[0]) {
      return null;
    }
    
    const row = cardResult[0];
    
    // Get skill details
    const skillDetailsResult = await db
      .select()
      .from(schema.skillDetails)
      .where(eq(schema.skillDetails.cardId, id))
      .orderBy(schema.skillDetails.skillLevel);
    
    // Combine all data with snake_case for backward compatibility
    return {
      ...row.cards,
      // Add snake_case versions
      card_id: row.cards.cardId,
      name_other: row.cards.nameOther,
      get_type: row.cards.getType,
      awakening_item: row.cards.awakeningItem,
      // Add stats
      attribute: row.card_stats?.attribute,
      shout_min: row.card_stats?.shoutMin,
      shout_max: row.card_stats?.shoutMax,
      beat_min: row.card_stats?.beatMin,
      beat_max: row.card_stats?.beatMax,
      melody_min: row.card_stats?.melodyMin,
      melody_max: row.card_stats?.melodyMax,
      // Add skills
      ap_skill_type: row.card_skills?.apSkillType,
      ap_skill_req: row.card_skills?.apSkillReq,
      ap_skill_name: row.card_skills?.apSkillName,
      ct_skill: row.card_skills?.ctSkill,
      sp_time: row.card_skills?.spTime,
      sp_value: row.card_skills?.spValue,
      comment: row.card_skills?.comment,
      // Add release info
      year: row.release_info?.year,
      month: row.release_info?.month,
      day: row.release_info?.day,
      event: row.release_info?.event,
      createtime: row.release_info?.createtime,
      updatetime: row.release_info?.updatetime,
      // Add broach info
      broach_shout: row.broach_info?.broachShout,
      broach_beat: row.broach_info?.broachBeat,
      broach_melody: row.broach_info?.broachMelody,
      broach_req: row.broach_info?.broachReq,
      // Add skill details with snake_case
      skill_details: skillDetailsResult.map(sd => ({
        skill_level: sd.skillLevel,
        count: sd.count,
        per: sd.per,
        value: sd.value,
        rate: sd.rate,
      })),
    } as any;
  } catch (error) {
    console.error('Error fetching card:', error);
    return null;
  }
}

export async function searchCards(query: string): Promise<CardWithDetails[]> {
  try {
    const db = getDb();
    const searchTerm = `%${query}%`;
    
    const result = await db
      .select()
      .from(schema.cards)
      .where(
        or(
          ilike(schema.cards.cardname, searchTerm),
          ilike(schema.cards.name, searchTerm),
          ilike(schema.cards.groupname, searchTerm)
        )
      )
      .orderBy(desc(schema.cards.id))
      .limit(100);
    
    // Transform to include snake_case
    return result.map(card => ({
      ...card,
      card_id: card.cardId,
      name_other: card.nameOther,
      get_type: card.getType,
      awakening_item: card.awakeningItem,
    })) as any[];
  } catch (error) {
    console.error('Error searching cards:', error);
    return [];
  }
}

export async function getCardsByRarity(rarity: string): Promise<CardWithDetails[]> {
  try {
    const db = getDb();
    
    const result = await db
      .select()
      .from(schema.cards)
      .where(eq(schema.cards.rarity, rarity))
      .orderBy(desc(schema.cards.id));
    
    // Transform to include snake_case
    return result.map(card => ({
      ...card,
      card_id: card.cardId,
      name_other: card.nameOther,
      get_type: card.getType,
      awakening_item: card.awakeningItem,
    })) as any[];
  } catch (error) {
    console.error('Error fetching cards by rarity:', error);
    return [];
  }
}

export async function getTotalCardCount(): Promise<number> {
  try {
    const db = getDb();
    
    // Count regular cards
    const regularResult = await db
      .select({ count: count() })
      .from(schema.cards);
    
    // Count group cards
    const groupResult = await db
      .select({ count: count() })
      .from(schema.groupCards);
    
    const regularCount = regularResult[0]?.count || 0;
    const groupCount = groupResult[0]?.count || 0;
    
    return regularCount + groupCount;
  } catch (error) {
    console.error('Error counting cards:', error);
    return 0;
  }
}

export async function getRarityStats() {
  try {
    const db = getDb();
    
    const result = await db
      .select({
        rarity: schema.cards.rarity,
        count: count(),
      })
      .from(schema.cards)
      .groupBy(schema.cards.rarity)
      .orderBy(desc(count()));
    
    return result;
  } catch (error) {
    console.error('Error fetching rarity stats:', error);
    return [];
  }
}

export interface ScoreUpSearchParams {
  name?: string;
  rarity?: string[];
  attribute?: number[];
  skillLevel?: number;
  year?: number;
  characterIds?: number[];
  costumeName?: string;
  skillActivationType?: string;
  skillType?: string[];
  eventBonus?: boolean;
}

export async function searchScoreUpCards(params: ScoreUpSearchParams): Promise<CardWithDetails[]> {
  try {
    const db = getDb();
    const conditions = [];
    
    // Build WHERE conditions
    if (params.name) {
      conditions.push(
        or(
          ilike(schema.cards.name, `%${params.name}%`),
          ilike(schema.cards.cardname, `%${params.name}%`)
        )
      );
    }
    
    if (params.characterIds && params.characterIds.length > 0) {
      const characterNames = params.characterIds.map(id => {
        switch(id) {
          case 1: return '和泉一織';
          case 2: return '二階堂大和';
          case 3: return '和泉三月';
          case 4: return '四葉環';
          case 5: return '逢坂壮五';
          case 6: return '六弥ナギ';
          case 7: return '七瀬陸';
          case 8: return '八乙女楽';
          case 9: return '九条天';
          case 10: return '十龍之介';
          case 11: return '百';
          case 12: return '千';
          case 13: return '亥清悠';
          case 14: return '狗丸トウマ';
          case 15: return '棗巳波';
          case 16: return '御堂虎於';
          case 17: return '大神万理';
          default: return '';
        }
      }).filter(name => name);
      
      if (characterNames.length > 0) {
        conditions.push(inArray(schema.cards.name, characterNames));
      }
    }
    
    if (params.costumeName) {
      conditions.push(ilike(schema.cards.cardname, `%${params.costumeName}%`));
    }
    
    if (params.rarity && params.rarity.length > 0) {
      conditions.push(inArray(schema.cards.rarity, params.rarity));
    }
    
    // Complex query with multiple joins
    const query = db
      .select()
      .from(schema.cards)
      .leftJoin(schema.cardStats, eq(schema.cards.id, schema.cardStats.id))
      .leftJoin(schema.cardSkills, eq(schema.cards.id, schema.cardSkills.id))
      .leftJoin(schema.releaseInfo, eq(schema.cards.id, schema.releaseInfo.id))
      .leftJoin(schema.skillDetails, eq(schema.cards.id, schema.skillDetails.cardId));
    
    // Add attribute filter
    if (params.attribute && params.attribute.length > 0) {
      conditions.push(inArray(schema.cardStats.attribute, params.attribute));
    }
    
    // Add year filter
    if (params.year) {
      conditions.push(eq(schema.releaseInfo.year, params.year));
    }
    
    // Add skill type filter
    if (params.skillType && params.skillType.length > 0) {
      conditions.push(inArray(schema.cardSkills.apSkillType, params.skillType));
    }
    
    // Add event bonus filter
    if (params.eventBonus) {
      conditions.push(sql`${schema.releaseInfo.event} IS NOT NULL AND ${schema.releaseInfo.event} != ''`);
    }
    
    // Apply all conditions
    const filteredQuery = conditions.length > 0
      ? query.where(and(...conditions))
      : query;
    
    const result = await filteredQuery
      .orderBy(desc(schema.cards.id));
    
    // Group results by card and aggregate skill details
    const cardMap = new Map<number, CardWithDetails>();
    
    for (const row of result) {
      const cardId = row.cards.id;
      
      if (!cardMap.has(cardId)) {
        cardMap.set(cardId, {
          ...row.cards,
          stats: row.card_stats,
          skills: row.card_skills,
          releaseInfo: row.release_info,
          skillDetails: [],
          // Add snake_case versions for compatibility
          card_id: row.cards.cardId,
          name_other: row.cards.nameOther,
          get_type: row.cards.getType,
          awakening_item: row.cards.awakeningItem,
          // Add flattened fields for compatibility
          attribute: row.card_stats?.attribute,
          shout_min: row.card_stats?.shoutMin,
          shout_max: row.card_stats?.shoutMax,
          beat_min: row.card_stats?.beatMin,
          beat_max: row.card_stats?.beatMax,
          melody_min: row.card_stats?.melodyMin,
          melody_max: row.card_stats?.melodyMax,
          ap_skill_type: row.card_skills?.apSkillType,
          ap_skill_req: row.card_skills?.apSkillReq,
          ap_skill_name: row.card_skills?.apSkillName,
          ct_skill: row.card_skills?.ctSkill,
          sp_time: row.card_skills?.spTime,
          sp_value: row.card_skills?.spValue,
          comment: row.card_skills?.comment,
          year: row.release_info?.year,
          month: row.release_info?.month,
          day: row.release_info?.day,
          event: row.release_info?.event,
        });
      }
      
      if (row.skill_details) {
        const card = cardMap.get(cardId)!;
        if (!card.skillDetails) {
          card.skillDetails = [];
        }
        card.skillDetails.push({
          id: row.skill_details.id,
          cardId: row.skill_details.cardId,
          skillLevel: row.skill_details.skillLevel,
          count: row.skill_details.count,
          per: row.skill_details.per,
          value: row.skill_details.value,
          rate: row.skill_details.rate,
        });
      }
    }
    
    return Array.from(cardMap.values());
  } catch (error) {
    console.error('Error searching score up cards:', error);
    return [];
  }
}

export async function getDistinctYears(): Promise<number[]> {
  try {
    const db = getDb();
    
    const result = await db
      .selectDistinct({
        year: schema.releaseInfo.year,
      })
      .from(schema.releaseInfo)
      .where(sql`${schema.releaseInfo.year} IS NOT NULL`)
      .orderBy(desc(schema.releaseInfo.year));
    
    return result.map(row => row.year).filter((year): year is number => year !== null);
  } catch (error) {
    console.error('Error fetching distinct years:', error);
    return [];
  }
}

export async function getDistinctSkillTypes(): Promise<string[]> {
  try {
    const db = getDb();
    
    const result = await db
      .selectDistinct({
        apSkillType: schema.cardSkills.apSkillType,
      })
      .from(schema.cardSkills)
      .where(sql`${schema.cardSkills.apSkillType} IS NOT NULL`)
      .orderBy(schema.cardSkills.apSkillType);
    
    return result.map(row => row.apSkillType).filter((type): type is string => type !== null);
  } catch (error) {
    console.error('Error fetching skill types:', error);
    return [];
  }
}

export async function getCharacters() {
  return [
    { id: 1, name: '和泉一織' },
    { id: 2, name: '二階堂大和' },
    { id: 3, name: '和泉三月' },
    { id: 4, name: '四葉環' },
    { id: 5, name: '逢坂壮五' },
    { id: 6, name: '六弥ナギ' },
    { id: 7, name: '七瀬陸' },
    { id: 8, name: '八乙女楽' },
    { id: 9, name: '九条天' },
    { id: 10, name: '十龍之介' },
    { id: 11, name: '百' },
    { id: 12, name: '千' },
    { id: 13, name: '亥清悠' },
    { id: 14, name: '狗丸トウマ' },
    { id: 15, name: '棗巳波' },
    { id: 16, name: '御堂虎於' },
    { id: 17, name: '大神万理' }
  ];
}