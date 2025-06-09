# Data Management

## Overview

Card data is sourced from Google Sheets and synchronized to PostgreSQL using Python scripts.

## Data Sources

### Google Sheets

**Main Spreadsheet**: Card data and statistics
- URL: `https://docs.google.com/spreadsheets/d/1LifgqDiRlQOIhP8blqEngJhI_Nnagbo8uspwmfg72fY/`
- Format: CSV export
- Update frequency: Weekly

### Data Structure

- **Cards Sheet**: Basic card information
- **Stats Sheet**: Stat values by level
- **Skills Sheet**: Skill descriptions and activation
- **Events Sheet**: Event and gacha information

## Synchronization Scripts

### fetch_sheets_data.py

Fetches data from Google Sheets and updates PostgreSQL.

```python
# Usage
python scripts/fetch_sheets_data.py

# Options
--sheet-id    # Google Sheets ID
--tabs        # Specific tabs to sync
--dry-run     # Preview changes without applying
```

### fetch_all_sheets_data.py

Synchronizes all data sources.

```python
# Usage
python scripts/fetch_all_sheets_data.py

# What it does:
# 1. Fetches all card data
# 2. Updates stats and skills
# 3. Syncs release information
# 4. Validates data integrity
```

### import_all_data.py

Imports data from local CSV files.

```python
# Usage
python scripts/import_all_data.py

# File structure expected:
data/
├── cards.csv
├── stats.csv
├── skills.csv
└── events.csv
```

## Data Validation

### verify-import.py

Verifies data integrity after import.

```python
# Usage
python scripts/verify-import.py

# Checks:
# - Card ID uniqueness
# - Stat value ranges
# - Skill data completeness
# - Image file existence
```

### Validation Rules

1. **Card IDs**
   - Must be unique
   - Sequential numbering
   - No gaps allowed

2. **Stats**
   - Min values < Max values
   - Values within expected ranges
   - All attributes present

3. **Skills**
   - Valid skill types
   - Activation rates 0-100%
   - Level progression logical

## Data Import Process

### 1. Preparation

```bash
# Backup current data
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d).sql

# Clear existing data (optional)
python scripts/clear_database.py
```

### 2. Import

```bash
# Fetch latest data
python scripts/fetch_all_sheets_data.py

# Or import from CSV
python scripts/import_all_data.py
```

### 3. Verification

```bash
# Run verification
python scripts/verify-import.py

# Check specific cards
psql -c "SELECT * FROM cards WHERE card_id = 1440;"
```

### 4. Post-Import

```bash
# Update search indexes
psql -c "REINDEX TABLE cards;"

# Refresh materialized views (if any)
psql -c "REFRESH MATERIALIZED VIEW card_summary;"
```

## Incremental Updates

### Adding New Cards

```python
# scripts/add_new_cards.py
import psycopg2
import csv

def add_cards(csv_file):
    # Connect to database
    conn = psycopg2.connect(DATABASE_URL)
    
    # Read new cards
    with open(csv_file) as f:
        reader = csv.DictReader(f)
        for row in reader:
            # Insert logic here
            pass
```

### Updating Existing Data

```sql
-- Update specific card
UPDATE cards 
SET cardname = 'New Name'
WHERE card_id = 1234;

-- Bulk update stats
UPDATE card_stats
SET shout_max = shout_max * 1.1
WHERE card_id IN (SELECT card_id FROM cards WHERE rarity = 'UR');
```

## Data Export

### Export to CSV

```bash
# Export all cards
psql -c "\copy cards TO 'cards_export.csv' CSV HEADER"

# Export with joins
psql -c "\copy (
  SELECT c.*, s.* 
  FROM cards c 
  JOIN card_stats s ON c.card_id = s.card_id
) TO 'full_export.csv' CSV HEADER"
```

### Backup Strategies

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backups/$(date +%Y/%m)"
mkdir -p $BACKUP_DIR

# Database backup
pg_dump $DATABASE_URL | gzip > "$BACKUP_DIR/i7_$(date +%Y%m%d).sql.gz"

# Keep last 30 days
find /backups -name "*.sql.gz" -mtime +30 -delete
```

## Image Management

### Card Images

- Location: `static/assets/cards/`
- Naming: `{card_id}.png`
- Format: PNG, 640x800px
- Size: ~200-500KB each

### Image Sync

```python
# Check missing images
import os
import psycopg2

conn = psycopg2.connect(DATABASE_URL)
cur = conn.cursor()
cur.execute("SELECT card_id FROM cards")

for (card_id,) in cur:
    image_path = f"static/assets/cards/{card_id}.png"
    if not os.path.exists(image_path):
        print(f"Missing image: {card_id}.png")
```

## Data Quality

### Common Issues

1. **Encoding Problems**
   - Use UTF-8 everywhere
   - Check Japanese characters
   - Validate special characters

2. **Duplicate Data**
   - Check for duplicate card_ids
   - Verify unique constraints
   - Remove redundant entries

3. **Missing Data**
   - Null value handling
   - Default value assignment
   - Data completion strategies

### Quality Checks

```sql
-- Check for duplicates
SELECT card_id, COUNT(*) 
FROM cards 
GROUP BY card_id 
HAVING COUNT(*) > 1;

-- Find missing stats
SELECT c.card_id 
FROM cards c
LEFT JOIN card_stats s ON c.card_id = s.card_id
WHERE s.card_id IS NULL;

-- Validate stat ranges
SELECT * FROM card_stats
WHERE shout_min > shout_max
   OR beat_min > beat_max
   OR melody_min > melody_max;
```

## Automation

### Scheduled Updates

```bash
# Crontab entry
0 3 * * * /path/to/scripts/daily_sync.sh

# daily_sync.sh
#!/bin/bash
cd /app
python scripts/fetch_all_sheets_data.py
python scripts/verify-import.py
```

### Monitoring

- Set up alerts for import failures
- Track data freshness
- Monitor data quality metrics