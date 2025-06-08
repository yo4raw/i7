import pg from 'pg';
import { building } from '$app/environment';

const { Pool } = pg;

// Database connection pool
let pool: pg.Pool | null = null;

function getPool() {
  if (!pool && !building) {
    // Use DATABASE_URL from environment or default to local connection
    const connectionString = process.env.DATABASE_URL || 'postgresql://i7user:i7password@postgres:5432/i7card?sslmode=disable';
    
    console.log('Initializing database connection...');
    
    pool = new Pool({
      connectionString,
      // Connection pool configuration
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
      // Ensure UTF-8 encoding
      client_encoding: 'UTF8',
    });
    
    // Test connection
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }
  return pool;
}

export interface SkillDetail {
  skill_level: number;
  count: number;
  per: number;
  value: number;
  rate: number;
}

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
  // From card_stats
  attribute?: number;
  shout_min?: number;
  shout_max?: number;
  beat_min?: number;
  beat_max?: number;
  melody_min?: number;
  melody_max?: number;
  // From card_skills
  ap_skill_type?: string;
  ap_skill_req?: number;
  ap_skill_name?: string;
  ct_skill?: number;
  sp_time?: number;
  sp_value?: number;
  comment?: string;
  // From release_info
  year?: number;
  month?: number;
  day?: number;
  event?: string;
  createtime?: Date;
  updatetime?: Date;
  // From broach_info
  broach_shout?: number;
  broach_beat?: number;
  broach_melody?: number;
  broach_req?: number;
  // Skill details
  skill_details?: SkillDetail[];
}

export async function getCards(limit = 50, offset = 0) {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    const result = await db.query(
      `SELECT 
        c.*,
        cs.attribute, cs.shout_min, cs.shout_max, cs.beat_min, cs.beat_max, cs.melody_min, cs.melody_max,
        csk.ap_skill_type, csk.ap_skill_req, csk.ap_skill_name, csk.ct_skill, csk.sp_time, csk.sp_value
      FROM i7card.cards c
      LEFT JOIN i7card.card_stats cs ON c.id = cs.id
      LEFT JOIN i7card.card_skills csk ON c.id = csk.id
      ORDER BY c.id DESC 
      LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows as Card[];
  } catch (error) {
    console.error('Error fetching cards:', error);
    return [];
  }
}

export async function getCardById(id: number) {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return null;
    }
    
    // Fetch main card data with joins
    const cardResult = await db.query(
      `SELECT 
        c.*,
        cs.attribute, cs.shout_min, cs.shout_max, cs.beat_min, cs.beat_max, cs.melody_min, cs.melody_max,
        csk.ap_skill_type, csk.ap_skill_req, csk.ap_skill_name, csk.ct_skill, csk.sp_time, csk.sp_value, csk.comment,
        ri.year, ri.month, ri.day, ri.event, ri.createtime, ri.updatetime,
        bi.broach_shout, bi.broach_beat, bi.broach_melody, bi.broach_req
      FROM i7card.cards c
      LEFT JOIN i7card.card_stats cs ON c.id = cs.id
      LEFT JOIN i7card.card_skills csk ON c.id = csk.id
      LEFT JOIN i7card.release_info ri ON c.id = ri.id
      LEFT JOIN i7card.broach_info bi ON c.id = bi.id
      WHERE c.id = $1`,
      [id]
    );
    
    if (!cardResult.rows[0]) {
      return null;
    }
    
    const card = cardResult.rows[0] as Card;
    
    // Fetch skill details separately
    const skillDetailsResult = await db.query(
      `SELECT skill_level, count, per, value, rate
       FROM i7card.skill_details
       WHERE card_id = $1
       ORDER BY skill_level`,
      [id]
    );
    
    card.skill_details = skillDetailsResult.rows as SkillDetail[];
    
    return card;
  } catch (error) {
    console.error('Error fetching card:', error);
    return null;
  }
}

export async function searchCards(query: string) {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    const searchTerm = `%${query}%`;
    const result = await db.query(
      `SELECT * FROM i7card.cards 
       WHERE cardname ILIKE $1 OR name ILIKE $1 OR groupname ILIKE $1
       ORDER BY id DESC LIMIT 100`,
      [searchTerm]
    );
    return result.rows as Card[];
  } catch (error) {
    console.error('Error searching cards:', error);
    return [];
  }
}

export async function getCardsByRarity(rarity: string) {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    const result = await db.query(
      'SELECT * FROM i7card.cards WHERE rarity = $1 ORDER BY id DESC',
      [rarity]
    );
    return result.rows as Card[];
  } catch (error) {
    console.error('Error fetching cards by rarity:', error);
    return [];
  }
}

export async function getTotalCardCount() {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return 0;
    }
    
    const result = await db.query('SELECT COUNT(*) FROM i7card.cards');
    return parseInt(result.rows[0].count);
  } catch (error) {
    console.error('Error counting cards:', error);
    return 0;
  }
}

export async function getRarityStats() {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    const result = await db.query(
      `SELECT rarity, COUNT(*) as count 
       FROM i7card.cards 
       GROUP BY rarity 
       ORDER BY count DESC`
    );
    return result.rows;
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
  skillActivationType?: string; // timer, perfect, combo
  skillType?: string[]; // スコアアップ, etc
  eventBonus?: boolean; // 特効
}

export async function searchScoreUpCards(params: ScoreUpSearchParams) {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    let query = `
      SELECT 
        c.*,
        cs.attribute, cs.shout_min, cs.shout_max, cs.beat_min, cs.beat_max, cs.melody_min, cs.melody_max,
        csk.ap_skill_type, csk.ap_skill_req, csk.ap_skill_name, csk.ct_skill, csk.sp_time, csk.sp_value, csk.comment,
        ri.year, ri.month, ri.day, ri.event,
        array_agg(
          json_build_object(
            'skill_level', sd.skill_level,
            'count', sd.count,
            'per', sd.per,
            'value', sd.value,
            'rate', sd.rate
          ) ORDER BY sd.skill_level
        ) FILTER (WHERE sd.skill_level IS NOT NULL) as skill_details
      FROM i7card.cards c
      LEFT JOIN i7card.card_stats cs ON c.id = cs.id
      LEFT JOIN i7card.card_skills csk ON c.id = csk.id
      LEFT JOIN i7card.release_info ri ON c.id = ri.id
      LEFT JOIN i7card.skill_details sd ON c.id = sd.card_id
      WHERE 1=1
    `;
    
    const queryParams: any[] = [];
    let paramIndex = 1;
    
    // Filter by name
    if (params.name) {
      query += ` AND (c.name ILIKE $${paramIndex} OR c.cardname ILIKE $${paramIndex})`;
      queryParams.push(`%${params.name}%`);
      paramIndex++;
    }
    
    // Filter by character IDs
    if (params.characterIds && params.characterIds.length > 0) {
      // Map character names to search patterns
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
        query += ` AND c.name = ANY($${paramIndex}::text[])`;
        queryParams.push(characterNames);
        paramIndex++;
      }
    }
    
    // Filter by costume name
    if (params.costumeName) {
      query += ` AND c.cardname ILIKE $${paramIndex}`;
      queryParams.push(`%${params.costumeName}%`);
      paramIndex++;
    }
    
    // Filter by rarity
    if (params.rarity && params.rarity.length > 0) {
      query += ` AND c.rarity = ANY($${paramIndex}::text[])`;
      queryParams.push(params.rarity);
      paramIndex++;
    }
    
    // Filter by attribute
    if (params.attribute && params.attribute.length > 0) {
      query += ` AND cs.attribute = ANY($${paramIndex}::int[])`;
      queryParams.push(params.attribute);
      paramIndex++;
    }
    
    // Filter by year
    if (params.year) {
      query += ` AND ri.year = $${paramIndex}`;
      queryParams.push(params.year);
      paramIndex++;
    }
    
    // Filter by skill activation type
    if (params.skillActivationType) {
      if (params.skillActivationType === 'timer') {
        query += ` AND csk.sp_time > 0`;
      } else if (params.skillActivationType === 'perfect') {
        query += ` AND sd.per = 1 AND sd.count > 0`;
      } else if (params.skillActivationType === 'combo') {
        query += ` AND sd.count >= 30`; // Combo skills typically have higher count requirements
      }
    }
    
    // Filter by skill type
    if (params.skillType && params.skillType.length > 0) {
      query += ` AND csk.ap_skill_type = ANY($${paramIndex}::text[])`;
      queryParams.push(params.skillType);
      paramIndex++;
    }
    
    // Filter by event bonus
    if (params.eventBonus) {
      query += ` AND ri.event IS NOT NULL AND ri.event != ''`;
    }
    
    // Filter by skill level if specified
    if (params.skillLevel) {
      query += ` AND sd.skill_level = $${paramIndex}`;
      queryParams.push(params.skillLevel);
      paramIndex++;
    }
    
    // Only include cards with score up skills
    query += ` AND csk.ap_skill_name IS NOT NULL AND sd.value > 0`;
    
    query += `
      GROUP BY c.id, cs.id, csk.id, ri.id
      ORDER BY c.id DESC
    `;
    
    const result = await db.query(query, queryParams);
    return result.rows.map(row => ({
      ...row,
      skill_details: row.skill_details || []
    })) as Card[];
  } catch (error) {
    console.error('Error searching score up cards:', error);
    return [];
  }
}

export async function getDistinctYears() {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    const result = await db.query(
      `SELECT DISTINCT year 
       FROM i7card.release_info 
       WHERE year IS NOT NULL 
       ORDER BY year DESC`
    );
    return result.rows.map(row => row.year);
  } catch (error) {
    console.error('Error fetching distinct years:', error);
    return [];
  }
}

export async function getDistinctSkillTypes() {
  try {
    const db = getPool();
    if (!db) {
      console.error('Database pool not initialized');
      return [];
    }
    
    const result = await db.query(
      `SELECT DISTINCT ap_skill_type 
       FROM i7card.card_skills 
       WHERE ap_skill_type IS NOT NULL 
       ORDER BY ap_skill_type`
    );
    return result.rows.map(row => row.ap_skill_type);
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