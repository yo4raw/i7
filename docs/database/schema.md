# Database Schema

## Overview

The PostgreSQL database uses schema `i7card` with tables organized into three main categories:
- Card Data Tables
- Game Mechanics Tables
- Score Calculation Tables

## Card Data Tables

### cards
Main card master data table.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Unique card identifier |
| cardname | TEXT | Card name |
| name | TEXT | Character name |
| rarity | TEXT | Card rarity (UR, SSR, SR, R) |
| attribute | TEXT | Card attribute |
| before_training_id | INTEGER | Pre-training card ID |
| after_training_id | INTEGER | Post-training card ID |
| before_training_url | TEXT | Pre-training image URL |
| after_training_url | TEXT | Post-training image URL |

### card_stats
Card statistics for different attributes.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Foreign key to cards |
| attribute | TEXT | Stat attribute type |
| shout_min | INTEGER | Minimum shout value |
| shout_max | INTEGER | Maximum shout value |
| beat_min | INTEGER | Minimum beat value |
| beat_max | INTEGER | Maximum beat value |
| melody_min | INTEGER | Minimum melody value |
| melody_max | INTEGER | Maximum melody value |

### card_skills
Skill information for cards.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Foreign key to cards |
| ap_skill_type | TEXT | AP skill type |
| ap_skill_name | TEXT | AP skill name |
| ct_skill | TEXT | CT skill description |
| ct_skill_type | TEXT | CT skill type (timer/perfect/combo) |
| event_bonus | TEXT | Event bonus information |

### skill_details
Detailed skill level information.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Foreign key to cards |
| skill_type | TEXT | Type of skill |
| skill_level | INTEGER | Skill level (1-4) |
| count | INTEGER | Activation count |
| per | REAL | Percentage value |
| value | INTEGER | Effect value |
| rate | REAL | Activation rate |

### release_info
Card release and event information.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Foreign key to cards |
| release_date | DATE | Card release date |
| event_name | TEXT | Associated event name |
| event_type | TEXT | Event type |
| gacha_name | TEXT | Gacha banner name |

### broach_info
Broach upgrade information.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Foreign key to cards |
| broach_level | INTEGER | Broach level |
| shout_bonus | INTEGER | Shout stat bonus |
| beat_bonus | INTEGER | Beat stat bonus |
| melody_bonus | INTEGER | Melody stat bonus |
| skill_rate_bonus | REAL | Skill rate bonus |

### skill_guess
Skill prediction and estimation data.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| card_id | INTEGER | Foreign key to cards |
| skill_name | TEXT | Predicted skill name |
| confidence | REAL | Prediction confidence |
| notes | TEXT | Additional notes |

## Game Mechanics Tables

### game_mechanics
Game mechanics multipliers and rules.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| mechanic_type | TEXT | Type of mechanic |
| value | REAL | Multiplier value |
| description | TEXT | Mechanic description |
| active | BOOLEAN | Is mechanic active |

## Score Calculation Tables

### songs
Song information for score calculations.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| name | TEXT | Song name |
| artist | TEXT | Artist name |
| total_notes | INTEGER | Total note count |
| duration | INTEGER | Song duration (seconds) |
| shout_percentage | REAL | Shout notes percentage |
| beat_percentage | REAL | Beat notes percentage |
| melody_percentage | REAL | Melody notes percentage |
| difficulty | TEXT | Song difficulty |

### team_compositions
Team setups and score calculations.

| Column | Type | Description |
|--------|------|-------------|
| id | INTEGER | Primary key |
| song_id | INTEGER | Foreign key to songs |
| team_name | TEXT | Team composition name |
| card_1_id | INTEGER | First card ID |
| card_2_id | INTEGER | Second card ID |
| card_3_id | INTEGER | Third card ID |
| card_4_id | INTEGER | Fourth card ID |
| card_5_id | INTEGER | Fifth card ID |
| calculated_score | INTEGER | Calculated team score |
| notes | TEXT | Additional notes |

## Indexes

- `idx_cards_card_id` on cards(card_id)
- `idx_cards_rarity` on cards(rarity)
- `idx_cards_attribute` on cards(attribute)
- `idx_card_stats_card_id` on card_stats(card_id)
- `idx_card_skills_card_id` on card_skills(card_id)
- `idx_skill_details_card_id` on skill_details(card_id)
- `idx_release_info_card_id` on release_info(card_id)
- `idx_release_info_date` on release_info(release_date)

## Foreign Key Constraints

All `card_id` columns in related tables have foreign key constraints referencing `cards(card_id)` with `ON DELETE CASCADE`.