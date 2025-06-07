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
    
    const result = await db.query(
      `SELECT 
        c.*,
        cs.attribute, cs.shout_min, cs.shout_max, cs.beat_min, cs.beat_max, cs.melody_min, cs.melody_max,
        csk.ap_skill_type, csk.ap_skill_req, csk.ap_skill_name, csk.ct_skill, csk.sp_time, csk.sp_value
      FROM i7card.cards c
      LEFT JOIN i7card.card_stats cs ON c.id = cs.id
      LEFT JOIN i7card.card_skills csk ON c.id = csk.id
      WHERE c.id = $1`,
      [id]
    );
    return result.rows[0] as Card | null;
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