# API Routes

## Overview

The application uses SvelteKit's file-based routing with server-side data loading. All routes support both SSR and client-side navigation.

## Public Routes

### Home Page
**Route**: `/`

**File**: `src/routes/+page.svelte`

**Server Load**: `src/routes/+page.server.ts`
- Fetches featured cards
- Returns recent updates
- Provides quick stats

### Card Listing
**Route**: `/cards`

**File**: `src/routes/cards/+page.svelte`

**Server Load**: `src/routes/cards/+page.server.ts`
- Fetches all cards with pagination
- Supports filtering by:
  - Rarity (UR, SSR, SR, R)
  - Attribute
  - Character
  - Skill type
- Returns card list with basic info

**Query Parameters**:
- `page` - Page number (default: 1)
- `rarity` - Filter by rarity
- `attribute` - Filter by attribute
- `character` - Filter by character name
- `skill` - Filter by skill type

### Card Details
**Route**: `/card/[id]`

**File**: `src/routes/card/[id]/+page.svelte`

**Server Load**: `src/routes/card/[id]/+page.server.ts`
- Fetches complete card information
- Includes:
  - Card stats (all levels)
  - Skills and skill details
  - Release information
  - Broach upgrade data
- Returns detailed card object

**Parameters**:
- `id` - Card ID (numeric)

### Score Optimization
**Route**: `/scoreup`

**File**: `src/routes/scoreup/+page.svelte`

**Server Load**: `src/routes/scoreup/+page.server.ts`
- Advanced card search for team building
- Filters:
  - Multiple attributes
  - Skill types (timer/perfect/combo)
  - Stat ranges
  - Event bonuses
- Returns optimized card suggestions

**Query Parameters**:
- `attributes[]` - Array of attributes
- `skillTypes[]` - Array of skill types
- `minStats` - Minimum stat requirements
- `eventBonus` - Event bonus filter

### About Page
**Route**: `/about`

**File**: `src/routes/about/+page.svelte`
- Static page with project information
- No server-side data loading

## Data Loading Pattern

All server-side data loading follows this pattern:

```typescript
// +page.server.ts
import type { PageServerLoad } from './$types';
import { getCards } from '$lib/db/queries';

export const load: PageServerLoad = async ({ params, url }) => {
  // Parse parameters and query strings
  const page = Number(url.searchParams.get('page')) || 1;
  
  // Fetch data from database
  const cards = await getCards({ page });
  
  // Return data to component
  return {
    cards,
    page
  };
};
```

## API Response Structure

### Card List Response
```typescript
{
  cards: Array<{
    id: number;
    card_id: number;
    cardname: string;
    name: string;
    rarity: string;
    attribute: string;
    thumbnail_url: string;
  }>;
  pagination: {
    page: number;
    totalPages: number;
    totalItems: number;
  };
}
```

### Card Detail Response
```typescript
{
  card: {
    id: number;
    card_id: number;
    cardname: string;
    name: string;
    rarity: string;
    attribute: string;
    before_training_url: string;
    after_training_url: string;
    stats: {
      shout_min: number;
      shout_max: number;
      beat_min: number;
      beat_max: number;
      melody_min: number;
      melody_max: number;
    };
    skills: {
      ap_skill_type: string;
      ap_skill_name: string;
      ct_skill: string;
      ct_skill_type: string;
      event_bonus: string;
    };
    skill_details: Array<{
      skill_level: number;
      count: number;
      per: number;
      value: number;
      rate: number;
    }>;
    release_info: {
      release_date: string;
      event_name: string;
      gacha_name: string;
    };
  };
}
```

## Error Handling

All routes implement standard error handling:

- **404 Not Found**: Invalid card ID or route
- **500 Internal Server Error**: Database connection issues
- **400 Bad Request**: Invalid query parameters

Errors are handled in the server load functions and return appropriate error pages.

## Caching Strategy

- Static assets cached for 1 year
- Card images cached for 1 month
- API responses include cache headers:
  - Card list: 5 minutes
  - Card details: 1 hour
  - Score calculations: No cache

## Rate Limiting

Currently no rate limiting is implemented. Consider adding for production:
- General API: 100 requests/minute
- Search endpoints: 20 requests/minute
- Static assets: Unlimited