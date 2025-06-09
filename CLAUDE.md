# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is an アイドリッシュセブン (IDOLiSH7) game database and strategy website built with SvelteKit. The application provides card information, skill details, and score optimization tools for game players.

## Common Development Commands

```bash
# Install dependencies
npm install

# Start development server (hot reload enabled)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Start production server
npm start

# Docker development environment
./dev.sh  # or docker compose -f docker-compose.dev.yml up -d

# Docker production
docker compose up -d
```

## Architecture Overview

### Tech Stack
- **Framework**: SvelteKit with TypeScript
- **Database**: PostgreSQL (production via Neon), SQLite (development)
- **ORM**: Drizzle ORM (migrated from raw SQL queries)
- **Styling**: Tailwind CSS
- **Deployment**: Render (app) + Neon (database)

### Database Schema
The PostgreSQL database uses schema `i7card` with these main tables:

**Card Data Tables:**
- `cards` - Card master data (id, card_id, cardname, name, rarity, etc.)
- `card_stats` - Card statistics (attribute, shout/beat/melody min/max values)
- `card_skills` - Skill information (ap_skill_type, ap_skill_name, ct_skill, etc.)
- `skill_details` - Level-specific skill details (skill_level, count, per, value, rate)
- `release_info` - Release dates and event information
- `broach_info` - Broach upgrade information
- `skill_guess` - Skill prediction data

**Game Mechanics Tables:**
- `game_mechanics` - Game mechanics multipliers and rules

**Score Calculation Tables:**
- `songs` - Song information (name, artist, notes, duration, attribute percentages)
- `team_compositions` - Team setups and score calculations for songs

### Key Application Routes
- `/` - Homepage
- `/cards` - Card listing with filtering
- `/card/[id]` - Individual card details
- `/scoreup` - Score optimization tool with advanced search

### Database Connection
- Connection string from `DATABASE_URL` environment variable
- Default: `postgresql://i7user:i7password@postgres:5432/i7card?sslmode=disable`
- Connection pool configured in `src/lib/db.ts`

### Data Management
- Card data sourced from Google Sheets
- Python scripts in `scripts/` for data synchronization:
  - `fetch_sheets_data.py` - Sync from Google Sheets to PostgreSQL
  - `debug_csv.py` - Debug CSV data issues
- Card images stored in `static/assets/cards/` (1.png to 1440.png)

### Key Implementation Details

1. **Database Queries** (`src/lib/db.ts`):
   - All database operations use connection pooling
   - Complex joins for fetching card data with stats and skills
   - Advanced search functionality for score optimization

2. **Server-Side Data Loading**:
   - Use `+page.server.ts` files for data fetching
   - Data passed to components via `load` functions
   - Type-safe with generated types

3. **Character Mapping**:
   - 17 characters mapped by ID in database queries
   - Character names hardcoded in `getCharacters()` function

4. **Score Optimization Search**:
   - Complex filtering by multiple parameters
   - Skill activation types: timer, perfect, combo
   - Event bonus filtering
   - Aggregated skill details per card

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string
- `NODE_ENV` - production/development
- `PORT` - Server port (default: 3000)

### Development Notes
- The project uses both English and Japanese throughout
- Card images are referenced by ID (e.g., `/assets/cards/123.png`)
- All timestamps and text encoding use UTF-8
- Database queries include proper error handling and logging