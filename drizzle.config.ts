import type { Config } from 'drizzle-kit';

export default {
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL || 'postgresql://i7user:i7password@postgres:5432/i7card?sslmode=disable',
  },
  schemaFilter: ['i7card'],
} satisfies Config;