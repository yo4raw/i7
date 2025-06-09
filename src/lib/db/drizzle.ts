import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Create connection pool
let pool: Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

// Check if we're in build mode (SvelteKit specific)
let isBuilding = false;
if (typeof process !== 'undefined' && process.env.VITE_SVELTEKIT_BUILDING === 'true') {
  isBuilding = true;
}

export function getDb() {
  if (!db && !isBuilding) {
    // Use DATABASE_URL from environment or default to local connection
    const connectionString = process.env.DATABASE_URL || 'postgresql://i7user:i7password@postgres:5432/i7card?sslmode=disable';
    
    console.log('Initializing Drizzle database connection...');
    
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      allowExitOnIdle: true,
    });
    
    pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
    
    // Create Drizzle instance
    db = drizzle(pool, { schema });
  }
  
  return db!;
}