#!/usr/bin/env python3
"""
Complete data import script for all 3 Google Sheets
"""
import csv
import psycopg2
from psycopg2.extras import Json
import requests
import sys
import os
from io import StringIO
from datetime import datetime

# Google Sheets info
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
SHEETS = {
    "cards": {"gid": "480354522", "name": "Main Card Data"},
    "songs": {"gid": "1083871743", "name": "Songs/Game Mechanics"},
    "group_cards": {"gid": "1087762308", "name": "Group Cards"}
}

# Database connection
DB_HOST = os.environ.get('DB_HOST', 'postgres')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'i7card')
DB_USER = os.environ.get('DB_USER', 'i7user')
DB_PASS = os.environ.get('DB_PASS', 'i7password')

def parse_value(value, value_type=str):
    """Parse cell value, handling empty strings"""
    if value == '' or value is None:
        return None
    try:
        if value_type == int:
            return int(value)
        elif value_type == float:
            # Handle percentage values
            if isinstance(value, str) and value.endswith('%'):
                return float(value.strip('%'))
            return float(value)
        else:
            return str(value).strip()
    except (ValueError, TypeError):
        return None

def parse_date(date_str):
    """Parse date string in various formats"""
    if not date_str or date_str == '':
        return None
    try:
        # Try different date formats
        for fmt in ['%Y/%m/%d', '%Y-%m-%d', '%Y年%m月%d日']:
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue
        return None
    except:
        return None

def fetch_csv_data(gid):
    """Fetch CSV data from Google Sheets"""
    url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    print(f"Fetching data from GID {gid}...")
    response = requests.get(url)
    response.raise_for_status()
    response.encoding = 'utf-8'
    return response.text

def import_main_cards(conn, csv_data):
    """Import main card data (existing implementation)"""
    print("\nImporting main card data...")
    cur = conn.cursor()
    
    # Parse CSV
    csv_file = StringIO(csv_data)
    reader = csv.DictReader(csv_file)
    
    row_count = 0
    error_count = 0
    
    for row in reader:
        try:
            card_id = parse_value(row.get('ID'), int)
            if not card_id:
                continue
                
            # Insert into cards table
            cur.execute("""
                INSERT INTO i7card.cards (
                    id, card_id, cardname, name, name_other, 
                    groupname, rarity, get_type, story, awakening_item
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    card_id = EXCLUDED.card_id,
                    cardname = EXCLUDED.cardname,
                    name = EXCLUDED.name,
                    name_other = EXCLUDED.name_other,
                    groupname = EXCLUDED.groupname,
                    rarity = EXCLUDED.rarity,
                    get_type = EXCLUDED.get_type,
                    story = EXCLUDED.story,
                    awakening_item = EXCLUDED.awakening_item
            """, (
                card_id,
                parse_value(row.get('cardID'), int) or card_id,
                parse_value(row.get('cardname')),
                parse_value(row.get('name')),
                parse_value(row.get('name_other')),
                parse_value(row.get('groupname')),
                parse_value(row.get('rarity')),
                parse_value(row.get('get_type')),
                parse_value(row.get('story')),
                parse_value(row.get('awakening_item'), int)
            ))
            
            # Insert into card_stats table
            cur.execute("""
                INSERT INTO i7card.card_stats (
                    id, attribute, shout_min, shout_max, 
                    beat_min, beat_max, melody_min, melody_max
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    attribute = EXCLUDED.attribute,
                    shout_min = EXCLUDED.shout_min,
                    shout_max = EXCLUDED.shout_max,
                    beat_min = EXCLUDED.beat_min,
                    beat_max = EXCLUDED.beat_max,
                    melody_min = EXCLUDED.melody_min,
                    melody_max = EXCLUDED.melody_max
            """, (
                card_id,
                parse_value(row.get('attribute'), int),
                parse_value(row.get('shout_min'), int),
                parse_value(row.get('shout_max'), int),
                parse_value(row.get('beat_min'), int),
                parse_value(row.get('beat_max'), int),
                parse_value(row.get('melody_min'), int),
                parse_value(row.get('melody_max'), int)
            ))
            
            # Insert into card_skills table
            cur.execute("""
                INSERT INTO i7card.card_skills (
                    id, ap_skill_type, ap_skill_req, ap_skill_name,
                    ct_skill, comment, sp_time, sp_value
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    ap_skill_type = EXCLUDED.ap_skill_type,
                    ap_skill_req = EXCLUDED.ap_skill_req,
                    ap_skill_name = EXCLUDED.ap_skill_name,
                    ct_skill = EXCLUDED.ct_skill,
                    comment = EXCLUDED.comment,
                    sp_time = EXCLUDED.sp_time,
                    sp_value = EXCLUDED.sp_value
            """, (
                card_id,
                parse_value(row.get('ap_skill_type')),
                parse_value(row.get('ap_skill_req'), int),
                parse_value(row.get('ap_skill_name')),
                parse_value(row.get('ct_skill'), int),
                parse_value(row.get('comment')),
                parse_value(row.get('sp_time'), int),
                parse_value(row.get('sp_value'), int)
            ))
            
            # Insert skill details (1-5 for AP skills)
            for i in range(1, 6):
                skill_count = parse_value(row.get(f'ap_skill_{i}_count'), int)
                skill_per = parse_value(row.get(f'ap_skill_{i}_per'), int)
                skill_value = parse_value(row.get(f'ap_skill_{i}_value'), int)
                skill_rate = parse_value(row.get(f'ap_skill_{i}_rate'), int)
                
                if any([skill_count, skill_per, skill_value, skill_rate]):
                    cur.execute("""
                        INSERT INTO i7card.skill_details (
                            card_id, skill_level, count, per, value, rate
                        ) VALUES (%s, %s, %s, %s, %s, %s)
                    """, (
                        card_id, i, skill_count, skill_per, skill_value, skill_rate
                    ))
            
            # Insert release info
            cur.execute("""
                INSERT INTO i7card.release_info (
                    id, year, month, day, event, createtime, updatetime, listview
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    year = EXCLUDED.year,
                    month = EXCLUDED.month,
                    day = EXCLUDED.day,
                    event = EXCLUDED.event,
                    createtime = EXCLUDED.createtime,
                    updatetime = EXCLUDED.updatetime,
                    listview = EXCLUDED.listview
            """, (
                card_id,
                parse_value(row.get('year'), int),
                parse_value(row.get('month'), int),
                parse_value(row.get('day'), int),
                parse_value(row.get('event')),
                parse_value(row.get('createtime')) if row.get('createtime') != '0000-00-00 00:00:00' else None,
                parse_value(row.get('updatetime')) if row.get('updatetime') != '0000-00-00 00:00:00' else None,
                parse_value(row.get('listview'), int) or 1
            ))
            
            # Insert broach info
            cur.execute("""
                INSERT INTO i7card.broach_info (
                    id, broach_shout, broach_beat, broach_melody, broach_req
                ) VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    broach_shout = EXCLUDED.broach_shout,
                    broach_beat = EXCLUDED.broach_beat,
                    broach_melody = EXCLUDED.broach_melody,
                    broach_req = EXCLUDED.broach_req
            """, (
                card_id,
                parse_value(row.get('broach_shout'), int),
                parse_value(row.get('broach_beat'), int),
                parse_value(row.get('broach_melody'), int),
                parse_value(row.get('broach_req'), int)
            ))
            
            # Insert skill guess info
            cur.execute("""
                INSERT INTO i7card.skill_guess (
                    id, ap_skill_1_guess, ap_skill_2_guess, 
                    ap_skill_3_guess, ap_skill_4_guess, ap_skill_5_guess
                ) VALUES (%s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    ap_skill_1_guess = EXCLUDED.ap_skill_1_guess,
                    ap_skill_2_guess = EXCLUDED.ap_skill_2_guess,
                    ap_skill_3_guess = EXCLUDED.ap_skill_3_guess,
                    ap_skill_4_guess = EXCLUDED.ap_skill_4_guess,
                    ap_skill_5_guess = EXCLUDED.ap_skill_5_guess
            """, (
                card_id,
                parse_value(row.get('ap_skill_1_guess'), int),
                parse_value(row.get('ap_skill_2_guess'), int),
                parse_value(row.get('ap_skill_3_guess'), int),
                parse_value(row.get('ap_skill_4_guess'), int),
                parse_value(row.get('ap_skill_5_guess'), int)
            ))
            
            row_count += 1
            
        except Exception as e:
            error_count += 1
            conn.rollback()
            continue
    
    conn.commit()
    print(f"Main cards imported: {row_count} rows, {error_count} errors")
    cur.close()

def import_songs(conn, csv_data):
    """Import songs/game mechanics data"""
    print("\nImporting songs data...")
    cur = conn.cursor()
    
    # Create table if needed
    cur.execute("""
        CREATE TABLE IF NOT EXISTS i7card.songs (
            id SERIAL PRIMARY KEY,
            song_id INTEGER UNIQUE,
            category VARCHAR(100),
            artist_name VARCHAR(200),
            song_name VARCHAR(200),
            song_type VARCHAR(50),
            difficulty VARCHAR(50),
            star_rating INTEGER,
            shout_percentage DECIMAL(5,2),
            beat_percentage DECIMAL(5,2),
            melody_percentage DECIMAL(5,2),
            notes_count INTEGER,
            duration_seconds INTEGER,
            update_date DATE
        )
    """)
    
    # Clear existing data
    cur.execute("TRUNCATE TABLE i7card.songs")
    
    # Parse CSV
    csv_file = StringIO(csv_data)
    reader = csv.reader(csv_file)
    
    rows = list(reader)
    if len(rows) < 3:  # Need at least headers and data
        print("No song data found")
        return
    
    # The first row might be empty, second row has headers
    headers = rows[1] if rows[1][0] == 'ID' else rows[0]
    data_start = 2 if rows[1][0] == 'ID' else 1
    
    row_count = 0
    error_count = 0
    
    for row in rows[data_start:]:
        try:
            # Skip empty rows or non-data rows
            if not row or not row[0] or row[0] == '' or not row[0].isdigit():
                continue
            
            song_id = parse_value(row[0], int)
            if not song_id:
                continue
            
            # Parse star rating
            star_rating = None
            if len(row) > 6 and row[6]:
                star_rating = row[6].count('★')
            
            # Parse percentages
            shout_pct = parse_value(row[7], float) if len(row) > 7 else None
            beat_pct = parse_value(row[8], float) if len(row) > 8 else None
            melody_pct = parse_value(row[9], float) if len(row) > 9 else None
            
            # Find update date (usually in the last column)
            update_date = None
            if len(row) > 60:
                for col in reversed(row):
                    if col and '/' in col:
                        update_date = parse_date(col)
                        if update_date:
                            break
            
            cur.execute("""
                INSERT INTO i7card.songs (
                    song_id, category, artist_name, song_name,
                    song_type, difficulty, star_rating,
                    shout_percentage, beat_percentage, melody_percentage,
                    notes_count, duration_seconds, update_date
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (song_id) DO UPDATE SET
                    category = EXCLUDED.category,
                    artist_name = EXCLUDED.artist_name,
                    song_name = EXCLUDED.song_name,
                    song_type = EXCLUDED.song_type,
                    difficulty = EXCLUDED.difficulty,
                    star_rating = EXCLUDED.star_rating,
                    shout_percentage = EXCLUDED.shout_percentage,
                    beat_percentage = EXCLUDED.beat_percentage,
                    melody_percentage = EXCLUDED.melody_percentage,
                    notes_count = EXCLUDED.notes_count,
                    duration_seconds = EXCLUDED.duration_seconds,
                    update_date = EXCLUDED.update_date
            """, (
                song_id,
                row[1] if len(row) > 1 else None,  # category
                row[2] if len(row) > 2 else None,  # artist_name
                row[3] if len(row) > 3 else None,  # song_name
                row[4] if len(row) > 4 else None,  # song_type
                row[5] if len(row) > 5 else None,  # difficulty
                star_rating,
                shout_pct, beat_pct, melody_pct,
                parse_value(row[10], int) if len(row) > 10 else None,  # notes_count
                parse_value(row[11], int) if len(row) > 11 else None,  # duration_seconds
                update_date
            ))
            
            row_count += 1
            
        except Exception as e:
            error_count += 1
            if error_count <= 3:
                print(f"Error processing song row: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    print(f"Songs imported: {row_count} rows, {error_count} errors")
    cur.close()

def import_group_cards(conn, csv_data):
    """Import group cards data"""
    print("\nImporting group cards data...")
    cur = conn.cursor()
    
    # Create table if needed
    cur.execute("""
        CREATE TABLE IF NOT EXISTS i7card.group_cards (
            id INTEGER PRIMARY KEY,
            card_id INTEGER,
            cardname VARCHAR(255),
            group_name VARCHAR(100),
            members TEXT,
            shout_value INTEGER,
            beat_value INTEGER,
            melody_value INTEGER,
            attribute INTEGER,
            idol_type VARCHAR(50),
            group_type VARCHAR(50),
            auto_score INTEGER,
            song_score INTEGER,
            score_limit INTEGER,
            broach_type VARCHAR(100)
        )
    """)
    
    # Clear existing data
    cur.execute("TRUNCATE TABLE i7card.group_cards")
    
    # Parse CSV
    csv_file = StringIO(csv_data)
    reader = csv.DictReader(csv_file)
    
    row_count = 0
    error_count = 0
    
    for row in reader:
        try:
            card_id = parse_value(row.get('ID'), int)
            if not card_id:
                continue
            
            cur.execute("""
                INSERT INTO i7card.group_cards (
                    id, card_id, cardname, group_name, members,
                    shout_value, beat_value, melody_value,
                    attribute, idol_type, group_type,
                    auto_score, song_score, score_limit, broach_type
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (id) DO UPDATE SET
                    card_id = EXCLUDED.card_id,
                    cardname = EXCLUDED.cardname,
                    group_name = EXCLUDED.group_name,
                    members = EXCLUDED.members,
                    shout_value = EXCLUDED.shout_value,
                    beat_value = EXCLUDED.beat_value,
                    melody_value = EXCLUDED.melody_value,
                    attribute = EXCLUDED.attribute,
                    idol_type = EXCLUDED.idol_type,
                    group_type = EXCLUDED.group_type,
                    auto_score = EXCLUDED.auto_score,
                    song_score = EXCLUDED.song_score,
                    score_limit = EXCLUDED.score_limit,
                    broach_type = EXCLUDED.broach_type
            """, (
                card_id,
                parse_value(row.get('cardID'), int),
                parse_value(row.get('cardname')),
                parse_value(row.get('name')),  # group_name
                parse_value(row.get('name_other')),  # members
                parse_value(row.get('Shout'), int),
                parse_value(row.get('Beat'), int),
                parse_value(row.get('Melody'), int),
                parse_value(row.get('属性'), int),
                parse_value(row.get('アイドル')),
                parse_value(row.get('グループ')),
                parse_value(row.get('オート'), int),
                parse_value(row.get('楽曲'), int),
                parse_value(row.get('上限'), int),
                parse_value(row.get('ブローチの種類'))
            ))
            
            row_count += 1
            
        except Exception as e:
            error_count += 1
            if error_count <= 3:
                print(f"Error processing group card: {e}")
            conn.rollback()
            continue
    
    conn.commit()
    print(f"Group cards imported: {row_count} rows, {error_count} errors")
    cur.close()

def main():
    """Main import function"""
    try:
        # Connect to database
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS,
            client_encoding='UTF8'
        )
        
        print("Starting complete data import...")
        
        # Import main cards
        cards_data = fetch_csv_data(SHEETS["cards"]["gid"])
        import_main_cards(conn, cards_data)
        
        # Import songs
        songs_data = fetch_csv_data(SHEETS["songs"]["gid"])
        import_songs(conn, songs_data)
        
        # Import group cards
        group_data = fetch_csv_data(SHEETS["group_cards"]["gid"])
        import_group_cards(conn, group_data)
        
        print("\n✅ All data import completed successfully!")
        
        conn.close()
        
    except Exception as e:
        print(f"❌ Fatal error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()