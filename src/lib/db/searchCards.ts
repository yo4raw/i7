import { eq, desc, ilike, or, and, inArray, sql } from 'drizzle-orm';
import { getDb } from './drizzle';
import * as schema from './schema';
import type { CardWithDetails } from './queries';

export interface CardSearchParams {
  name?: string;
  rarity?: string;
  attribute?: number;
  character?: string;
  skillType?: string;
}

export async function searchCards(params: CardSearchParams): Promise<CardWithDetails[]> {
  try {
    const db = getDb();
    const conditions = [];
    
    // 名前検索（カード名とキャラ名の両方を検索）
    if (params.name) {
      conditions.push(
        or(
          ilike(schema.cards.name, `%${params.name}%`),
          ilike(schema.cards.cardname, `%${params.name}%`),
          ilike(schema.cards.nameOther, `%${params.name}%`)
        )
      );
    }
    
    // レアリティ検索
    if (params.rarity) {
      if (params.rarity === 'GROUP') {
        // グループカードを検索する場合は別処理
        return searchGroupCards(params);
      }
      conditions.push(eq(schema.cards.rarity, params.rarity));
    }
    
    // キャラクター検索
    if (params.character) {
      conditions.push(ilike(schema.cards.name, `%${params.character}%`));
    }
    
    // 基本のクエリを構築
    let query = db
      .select()
      .from(schema.cards)
      .leftJoin(schema.cardStats, eq(schema.cards.id, schema.cardStats.id))
      .leftJoin(schema.cardSkills, eq(schema.cards.id, schema.cardSkills.id));
    
    // 属性検索（cardStatsとのJOINが必要）
    if (params.attribute) {
      conditions.push(eq(schema.cardStats.attribute, params.attribute));
    }
    
    // スキルタイプ検索（cardSkillsとのJOINが必要）
    if (params.skillType) {
      conditions.push(ilike(schema.cardSkills.apSkillName, `%${params.skillType}%`));
    }
    
    // WHERE条件を適用
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    // 結果を取得
    const result = await query.orderBy(desc(schema.cards.id));
    
    // 結果を変換
    return result.map(row => ({
      ...row.cards,
      // 互換性のために snake_case バージョンも追加
      card_id: row.cards.cardId,
      name_other: row.cards.nameOther,
      get_type: row.cards.getType,
      awakening_item: row.cards.awakeningItem,
      // stats から
      attribute: row.card_stats?.attribute,
      shout_min: row.card_stats?.shoutMin,
      shout_max: row.card_stats?.shoutMax,
      beat_min: row.card_stats?.beatMin,
      beat_max: row.card_stats?.beatMax,
      melody_min: row.card_stats?.melodyMin,
      melody_max: row.card_stats?.melodyMax,
      // skills から
      ap_skill_type: row.card_skills?.apSkillType,
      ap_skill_req: row.card_skills?.apSkillReq,
      ap_skill_name: row.card_skills?.apSkillName,
      ct_skill: row.card_skills?.ctSkill,
      sp_time: row.card_skills?.spTime,
      sp_value: row.card_skills?.spValue,
      comment: row.card_skills?.comment,
    }));
  } catch (error) {
    console.error('Error searching cards:', error);
    return [];
  }
}

// グループカード専用の検索関数
async function searchGroupCards(params: CardSearchParams): Promise<CardWithDetails[]> {
  try {
    const db = getDb();
    const conditions = [];
    
    // 名前検索
    if (params.name) {
      conditions.push(
        or(
          ilike(schema.groupCards.groupName, `%${params.name}%`),
          ilike(schema.groupCards.cardname, `%${params.name}%`),
          ilike(schema.groupCards.members, `%${params.name}%`)
        )
      );
    }
    
    // キャラクター検索（メンバーから検索）
    if (params.character) {
      conditions.push(ilike(schema.groupCards.members, `%${params.character}%`));
    }
    
    // 属性検索
    if (params.attribute) {
      conditions.push(eq(schema.groupCards.attribute, params.attribute));
    }
    
    let query = db.select().from(schema.groupCards);
    
    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }
    
    const result = await query.orderBy(desc(schema.groupCards.id));
    
    // グループカードをCardWithDetails形式に変換
    return result.map(gc => ({
      id: gc.id,
      card_id: gc.cardId,
      cardId: gc.cardId,
      cardname: gc.cardname,
      name: gc.groupName,
      name_other: gc.members,
      nameOther: gc.members,
      groupname: gc.groupType,
      rarity: 'GROUP',
      get_type: 'グループ',
      getType: 'グループ',
      story: null,
      awakening_item: null,
      awakeningItem: null,
      attribute: gc.attribute,
      shout_max: gc.shoutValue,
      beat_max: gc.beatValue,
      melody_max: gc.melodyValue,
      is_group_card: true,
      broach_type: gc.broachType,
    }));
  } catch (error) {
    console.error('Error searching group cards:', error);
    return [];
  }
}