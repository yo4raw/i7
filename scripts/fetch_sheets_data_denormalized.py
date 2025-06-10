#!/usr/bin/env python3
import csv
import psycopg2
import requests
import sys
import os
from io import StringIO

# Google Sheets CSV export URL
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
GID = "480354522"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

# Database connection
DB_HOST = os.environ.get('DB_HOST', 'postgres')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'i7card')
DB_USER = os.environ.get('DB_USER', 'i7user')
DB_PASS = os.environ.get('DB_PASS', 'i7password')

def fetch_csv_data():
    """Fetch CSV data from Google Sheets"""
    print("Fetching data from Google Sheets...")
    response = requests.get(SHEET_URL)
    response.raise_for_status()
    response.encoding = 'utf-8'  # Force UTF-8 encoding
    return response.text

def parse_value(value, value_type=str):
    """Parse cell value, handling empty strings"""
    if value == '' or value is None:
        return None
    try:
        if value_type == int:
            return int(value)
        elif value_type == float:
            return float(value)
        else:
            return str(value).strip()
    except (ValueError, TypeError):
        return None

def import_data_to_db(csv_data):
    """Import CSV data to PostgreSQL in denormalized format"""
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        client_encoding='UTF8'
    )
    cur = conn.cursor()
    
    # Create denormalized table if not exists
    cur.execute("""
        CREATE TABLE IF NOT EXISTS i7card.cards_denormalized (
            id INTEGER PRIMARY KEY,
            card_id INTEGER,
            cardname VARCHAR(255),
            name VARCHAR(100),
            name_other VARCHAR(100),
            groupname VARCHAR(100),
            rarity VARCHAR(10),
            get_type VARCHAR(50),
            story TEXT,
            awakening_item INTEGER,
            -- Stats
            attribute INTEGER,
            shout_min INTEGER,
            shout_max INTEGER,
            beat_min INTEGER,
            beat_max INTEGER,
            melody_min INTEGER,
            melody_max INTEGER,
            -- Skills
            ap_skill_type VARCHAR(100),
            ap_skill_req INTEGER,
            ap_skill_name VARCHAR(255),
            ct_skill INTEGER,
            comment TEXT,
            sp_time INTEGER,
            sp_value INTEGER,
            -- Skill details (levels 1-5)
            ap_skill_1_count INTEGER,
            ap_skill_1_per INTEGER,
            ap_skill_1_value INTEGER,
            ap_skill_1_rate INTEGER,
            ap_skill_2_count INTEGER,
            ap_skill_2_per INTEGER,
            ap_skill_2_value INTEGER,
            ap_skill_2_rate INTEGER,
            ap_skill_3_count INTEGER,
            ap_skill_3_per INTEGER,
            ap_skill_3_value INTEGER,
            ap_skill_3_rate INTEGER,
            ap_skill_4_count INTEGER,
            ap_skill_4_per INTEGER,
            ap_skill_4_value INTEGER,
            ap_skill_4_rate INTEGER,
            ap_skill_5_count INTEGER,
            ap_skill_5_per INTEGER,
            ap_skill_5_value INTEGER,
            ap_skill_5_rate INTEGER,
            -- Release info
            year INTEGER,
            month INTEGER,
            day INTEGER,
            event VARCHAR(255),
            createtime TIMESTAMP,
            updatetime TIMESTAMP,
            listview INTEGER,
            -- Broach info
            broach_shout INTEGER,
            broach_beat INTEGER,
            broach_melody INTEGER,
            broach_req INTEGER,
            -- Skill guess
            ap_skill_1_guess INTEGER,
            ap_skill_2_guess INTEGER,
            ap_skill_3_guess INTEGER,
            ap_skill_4_guess INTEGER,
            ap_skill_5_guess INTEGER
        )
    """)
    
    # Parse CSV
    csv_file = StringIO(csv_data)
    reader = csv.DictReader(csv_file)
    
    row_count = 0
    error_count = 0
    skipped_count = 0
    total_rows = 0
    
    for row in reader:
        total_rows += 1
        try:
            # Parse main card data
            card_id = parse_value(row.get('ID'), int)
            if not card_id:
                skipped_count += 1
                print(f"Skipped row {total_rows}: No ID found - {row}")
                continue
                
            # Insert all data into denormalized table
            cur.execute("""
                INSERT INTO i7card.cards_denormalized (
                    id, card_id, cardname, name, name_other, groupname, rarity, get_type, story, awakening_item,
                    attribute, shout_min, shout_max, beat_min, beat_max, melody_min, melody_max,
                    ap_skill_type, ap_skill_req, ap_skill_name, ct_skill, comment, sp_time, sp_value,
                    ap_skill_1_count, ap_skill_1_per, ap_skill_1_value, ap_skill_1_rate,
                    ap_skill_2_count, ap_skill_2_per, ap_skill_2_value, ap_skill_2_rate,
                    ap_skill_3_count, ap_skill_3_per, ap_skill_3_value, ap_skill_3_rate,
                    ap_skill_4_count, ap_skill_4_per, ap_skill_4_value, ap_skill_4_rate,
                    ap_skill_5_count, ap_skill_5_per, ap_skill_5_value, ap_skill_5_rate,
                    year, month, day, event, createtime, updatetime, listview,
                    broach_shout, broach_beat, broach_melody, broach_req,
                    ap_skill_1_guess, ap_skill_2_guess, ap_skill_3_guess, ap_skill_4_guess, ap_skill_5_guess
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s, %s, %s, %s,
                    %s, %s, %s, %s, %s
                )
                ON CONFLICT (id) DO UPDATE SET
                    card_id = EXCLUDED.card_id,
                    cardname = EXCLUDED.cardname,
                    name = EXCLUDED.name,
                    name_other = EXCLUDED.name_other,
                    groupname = EXCLUDED.groupname,
                    rarity = EXCLUDED.rarity,
                    get_type = EXCLUDED.get_type,
                    story = EXCLUDED.story,
                    awakening_item = EXCLUDED.awakening_item,
                    attribute = EXCLUDED.attribute,
                    shout_min = EXCLUDED.shout_min,
                    shout_max = EXCLUDED.shout_max,
                    beat_min = EXCLUDED.beat_min,
                    beat_max = EXCLUDED.beat_max,
                    melody_min = EXCLUDED.melody_min,
                    melody_max = EXCLUDED.melody_max,
                    ap_skill_type = EXCLUDED.ap_skill_type,
                    ap_skill_req = EXCLUDED.ap_skill_req,
                    ap_skill_name = EXCLUDED.ap_skill_name,
                    ct_skill = EXCLUDED.ct_skill,
                    comment = EXCLUDED.comment,
                    sp_time = EXCLUDED.sp_time,
                    sp_value = EXCLUDED.sp_value,
                    ap_skill_1_count = EXCLUDED.ap_skill_1_count,
                    ap_skill_1_per = EXCLUDED.ap_skill_1_per,
                    ap_skill_1_value = EXCLUDED.ap_skill_1_value,
                    ap_skill_1_rate = EXCLUDED.ap_skill_1_rate,
                    ap_skill_2_count = EXCLUDED.ap_skill_2_count,
                    ap_skill_2_per = EXCLUDED.ap_skill_2_per,
                    ap_skill_2_value = EXCLUDED.ap_skill_2_value,
                    ap_skill_2_rate = EXCLUDED.ap_skill_2_rate,
                    ap_skill_3_count = EXCLUDED.ap_skill_3_count,
                    ap_skill_3_per = EXCLUDED.ap_skill_3_per,
                    ap_skill_3_value = EXCLUDED.ap_skill_3_value,
                    ap_skill_3_rate = EXCLUDED.ap_skill_3_rate,
                    ap_skill_4_count = EXCLUDED.ap_skill_4_count,
                    ap_skill_4_per = EXCLUDED.ap_skill_4_per,
                    ap_skill_4_value = EXCLUDED.ap_skill_4_value,
                    ap_skill_4_rate = EXCLUDED.ap_skill_4_rate,
                    ap_skill_5_count = EXCLUDED.ap_skill_5_count,
                    ap_skill_5_per = EXCLUDED.ap_skill_5_per,
                    ap_skill_5_value = EXCLUDED.ap_skill_5_value,
                    ap_skill_5_rate = EXCLUDED.ap_skill_5_rate,
                    year = EXCLUDED.year,
                    month = EXCLUDED.month,
                    day = EXCLUDED.day,
                    event = EXCLUDED.event,
                    createtime = EXCLUDED.createtime,
                    updatetime = EXCLUDED.updatetime,
                    listview = EXCLUDED.listview,
                    broach_shout = EXCLUDED.broach_shout,
                    broach_beat = EXCLUDED.broach_beat,
                    broach_melody = EXCLUDED.broach_melody,
                    broach_req = EXCLUDED.broach_req,
                    ap_skill_1_guess = EXCLUDED.ap_skill_1_guess,
                    ap_skill_2_guess = EXCLUDED.ap_skill_2_guess,
                    ap_skill_3_guess = EXCLUDED.ap_skill_3_guess,
                    ap_skill_4_guess = EXCLUDED.ap_skill_4_guess,
                    ap_skill_5_guess = EXCLUDED.ap_skill_5_guess
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
                parse_value(row.get('awakening_item'), int),
                # Stats
                parse_value(row.get('attribute'), int),
                parse_value(row.get('shout_min'), int),
                parse_value(row.get('shout_max'), int),
                parse_value(row.get('beat_min'), int),
                parse_value(row.get('beat_max'), int),
                parse_value(row.get('melody_min'), int),
                parse_value(row.get('melody_max'), int),
                # Skills
                parse_value(row.get('ap_skill_type')),
                parse_value(row.get('ap_skill_req'), int),
                parse_value(row.get('ap_skill_name')),
                parse_value(row.get('ct_skill'), int),
                parse_value(row.get('comment')),
                parse_value(row.get('sp_time'), int),
                parse_value(row.get('sp_value'), int),
                # Skill details level 1
                parse_value(row.get('ap_skill_1_count'), int),
                parse_value(row.get('ap_skill_1_per'), int),
                parse_value(row.get('ap_skill_1_value'), int),
                parse_value(row.get('ap_skill_1_rate'), int),
                # Skill details level 2
                parse_value(row.get('ap_skill_2_count'), int),
                parse_value(row.get('ap_skill_2_per'), int),
                parse_value(row.get('ap_skill_2_value'), int),
                parse_value(row.get('ap_skill_2_rate'), int),
                # Skill details level 3
                parse_value(row.get('ap_skill_3_count'), int),
                parse_value(row.get('ap_skill_3_per'), int),
                parse_value(row.get('ap_skill_3_value'), int),
                parse_value(row.get('ap_skill_3_rate'), int),
                # Skill details level 4
                parse_value(row.get('ap_skill_4_count'), int),
                parse_value(row.get('ap_skill_4_per'), int),
                parse_value(row.get('ap_skill_4_value'), int),
                parse_value(row.get('ap_skill_4_rate'), int),
                # Skill details level 5
                parse_value(row.get('ap_skill_5_count'), int),
                parse_value(row.get('ap_skill_5_per'), int),
                parse_value(row.get('ap_skill_5_value'), int),
                parse_value(row.get('ap_skill_5_rate'), int),
                # Release info
                parse_value(row.get('year'), int),
                parse_value(row.get('month'), int),
                parse_value(row.get('day'), int),
                parse_value(row.get('event')),
                parse_value(row.get('createtime')) if row.get('createtime') != '0000-00-00 00:00:00' else None,
                parse_value(row.get('updatetime')) if row.get('updatetime') != '0000-00-00 00:00:00' else None,
                parse_value(row.get('listview'), int) or 1,
                # Broach info
                parse_value(row.get('broach_shout'), int),
                parse_value(row.get('broach_beat'), int),
                parse_value(row.get('broach_melody'), int),
                parse_value(row.get('broach_req'), int),
                # Skill guess
                parse_value(row.get('ap_skill_1_guess'), int),
                parse_value(row.get('ap_skill_2_guess'), int),
                parse_value(row.get('ap_skill_3_guess'), int),
                parse_value(row.get('ap_skill_4_guess'), int),
                parse_value(row.get('ap_skill_5_guess'), int)
            ))
            
            row_count += 1
            conn.commit()  # Commit each successful row
            
        except Exception as e:
            error_count += 1
            print(f"Error processing row {card_id}: {e}")
            conn.rollback()
            continue
    
    print(f"Total rows: {total_rows}, Successfully imported: {row_count}, Errors: {error_count}, Skipped: {skipped_count}")
    
    cur.close()
    conn.close()

def main():
    try:
        # Fetch data from Google Sheets
        csv_data = fetch_csv_data()
        
        # Import to database
        import_data_to_db(csv_data)
        
        print("Data import completed successfully!")
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()