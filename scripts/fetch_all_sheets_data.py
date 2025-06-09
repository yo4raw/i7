#!/usr/bin/env python3
import csv
import psycopg2
import requests
import sys
import os
from io import StringIO

# Google Sheets configuration
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
SHEET1_GID = "480354522"  # Main card data
SHEET2_GID = "1083871743"  # Game mechanics data
SHEET3_GID = "1555231665"  # Score calculation/team composition data

# Database connection
DB_HOST = os.environ.get('DB_HOST', 'postgres')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'i7card')
DB_USER = os.environ.get('DB_USER', 'i7user')
DB_PASS = os.environ.get('DB_PASS', 'i7password')

def fetch_csv_data(gid):
    """Fetch CSV data from Google Sheets"""
    sheet_url = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={gid}"
    print(f"Fetching data from GID {gid}...")
    response = requests.get(sheet_url)
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

def import_main_card_data(csv_data, conn):
    """Import main card data from the first sheet"""
    print("\nImporting main card data...")
    cur = conn.cursor()
    
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
                parse_value(row.get('cardID'), int) or card_id,  # Use ID if cardID is empty
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
            
            # Delete existing skill details for this card
            cur.execute("DELETE FROM i7card.skill_details WHERE card_id = %s", (card_id,))
            
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
            
            # Insert release info (with default values if not present)
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
            
            # Insert broach info (with default values if not present)
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
            
            # Insert skill guess info (with default values if not present)
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
            conn.commit()  # Commit each successful row
            
        except Exception as e:
            error_count += 1
            print(f"Error processing row {card_id}: {e}")
            conn.rollback()
            continue
    
    print(f"Main card data - Total rows: {total_rows}, Successfully imported: {row_count}, Errors: {error_count}, Skipped: {skipped_count}")
    cur.close()
    return row_count > 0

def create_game_mechanics_table(conn):
    """Create table for game mechanics data if it doesn't exist"""
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS i7card.game_mechanics (
                id SERIAL PRIMARY KEY,
                update_date DATE,
                category VARCHAR(100),
                attribute VARCHAR(50),
                multiplier DECIMAL(5,2),
                value INTEGER,
                notes TEXT
            )
        """)
        conn.commit()
        print("Game mechanics table created/verified")
    except Exception as e:
        print(f"Error creating game mechanics table: {e}")
        conn.rollback()
    finally:
        cur.close()

def import_game_mechanics_data(csv_data, conn):
    """Import game mechanics data from the second sheet"""
    print("\nImporting game mechanics data...")
    
    # First ensure the table exists
    create_game_mechanics_table(conn)
    
    cur = conn.cursor()
    
    # Clear existing data
    cur.execute("TRUNCATE TABLE i7card.game_mechanics")
    
    # Parse CSV
    csv_file = StringIO(csv_data)
    lines = csv_file.readlines()
    
    if len(lines) < 2:
        print("No data found in game mechanics sheet")
        cur.close()
        return False
    
    # The sheet structure seems to have categories as headers and data below
    # Let's try to parse it in a more flexible way
    row_count = 0
    
    try:
        # Process the CSV data line by line
        # This is a simplified approach - you may need to adjust based on actual data structure
        for i, line in enumerate(lines):
            if i == 0:  # Skip header row
                continue
                
            # Parse the line
            values = line.strip().split(',')
            if len(values) > 1 and values[0]:  # If there's a date in first column
                update_date = values[0]
                # Process remaining values as needed
                # This is a placeholder - adjust based on actual data structure
                
        conn.commit()
        print(f"Game mechanics data imported: {row_count} rows")
        
    except Exception as e:
        print(f"Error importing game mechanics data: {e}")
        conn.rollback()
        
    cur.close()
    return row_count > 0

def create_score_calculation_tables(conn):
    """Create tables for score calculation data"""
    cur = conn.cursor()
    try:
        # Create song data table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS i7card.songs (
                id SERIAL PRIMARY KEY,
                song_type VARCHAR(50),
                song_category VARCHAR(50),
                song_name VARCHAR(200),
                artist_name VARCHAR(200),
                notes_count INTEGER,
                duration_seconds INTEGER,
                shout_percentage DECIMAL(5,2),
                beat_percentage DECIMAL(5,2),
                melody_percentage DECIMAL(5,2),
                last_updated DATE
            )
        """)
        
        # Create team composition table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS i7card.team_compositions (
                id SERIAL PRIMARY KEY,
                composition_name VARCHAR(200),
                song_id INTEGER REFERENCES i7card.songs(id),
                position1_card_id INTEGER,
                position2_card_id INTEGER,
                position3_card_id INTEGER,
                position4_card_id INTEGER,
                position5_card_id INTEGER,
                position6_card_id INTEGER,
                scoreup_assist BOOLEAN,
                scoreup_badge BOOLEAN,
                reduction_coverage DECIMAL(5,2),
                attribute_score INTEGER,
                scoreup_skill_score INTEGER,
                reduction_skill_score INTEGER,
                live_end_score INTEGER,
                final_result_score INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        conn.commit()
        print("Score calculation tables created/verified")
    except Exception as e:
        print(f"Error creating score calculation tables: {e}")
        conn.rollback()
    finally:
        cur.close()

def import_score_calculation_data(csv_data, conn):
    """Import score calculation data from the third sheet"""
    print("\nImporting score calculation data...")
    
    # First ensure the tables exist
    create_score_calculation_tables(conn)
    
    cur = conn.cursor()
    
    # Parse CSV
    csv_file = StringIO(csv_data)
    reader = csv.reader(csv_file)
    
    rows = list(reader)
    if len(rows) < 20:
        print("Insufficient data in score calculation sheet")
        cur.close()
        return False
    
    try:
        # Extract song information from specific rows
        song_type = None
        song_category = None
        song_name = None
        artist_name = None
        notes_count = None
        duration_seconds = None
        
        # Find and extract data based on row patterns
        for i, row in enumerate(rows):
            if len(row) > 1:
                if row[1] == '種類' and i+1 < len(rows):
                    song_type = rows[i][3] if len(rows[i]) > 3 else None
                elif row[1] == '分類' and i+1 < len(rows):
                    song_category = rows[i][3] if len(rows[i]) > 3 else None
                elif row[1] == '曲名' and i+1 < len(rows):
                    song_name = rows[i][3] if len(rows[i]) > 3 else None
                elif row[1] == 'アーティスト名' and i+1 < len(rows):
                    artist_name = rows[i][3] if len(rows[i]) > 3 else None
                elif row[1] == 'ノーツ数' and i+1 < len(rows):
                    notes_count = parse_value(rows[i][3], int) if len(rows[i]) > 3 else None
                elif row[1] == '秒数' and i+1 < len(rows):
                    duration_seconds = parse_value(rows[i][3], int) if len(rows[i]) > 3 else None
        
        # Extract percentages
        shout_pct = None
        beat_pct = None
        melody_pct = None
        for i, row in enumerate(rows):
            if len(row) > 9 and row[7] == 'Shout' and row[9] == 'Beat' and row[11] == 'Melody':
                if i+1 < len(rows):
                    shout_pct = parse_value(rows[i+1][8].strip('%'), float) if len(rows[i+1]) > 8 else None
                    beat_pct = parse_value(rows[i+1][10].strip('%'), float) if len(rows[i+1]) > 10 else None
                    melody_pct = parse_value(rows[i+1][12].strip('%'), float) if len(rows[i+1]) > 12 else None
                    break
        
        # Insert song data if we have at least the song name
        if song_name:
            # First check if song exists
            cur.execute("SELECT id FROM i7card.songs WHERE song_name = %s", (song_name,))
            existing = cur.fetchone()
            
            if existing:
                song_id = existing[0]
                # Update existing song
                cur.execute("""
                    UPDATE i7card.songs SET
                        song_type = %s, song_category = %s, artist_name = %s,
                        notes_count = %s, duration_seconds = %s, shout_percentage = %s,
                        beat_percentage = %s, melody_percentage = %s, last_updated = CURRENT_DATE
                    WHERE id = %s
                """, (
                    song_type, song_category, artist_name,
                    notes_count, duration_seconds, shout_pct, beat_pct, melody_pct,
                    song_id
                ))
            else:
                # Insert new song
                cur.execute("""
                    INSERT INTO i7card.songs (
                        song_type, song_category, song_name, artist_name,
                        notes_count, duration_seconds, shout_percentage,
                        beat_percentage, melody_percentage, last_updated
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, CURRENT_DATE)
                    RETURNING id
                """, (
                    song_type, song_category, song_name, artist_name,
                    notes_count, duration_seconds, shout_pct, beat_pct, melody_pct
                ))
                result = cur.fetchone()
                if result:
                    song_id = result[0]
            
            print(f"Processed song: {song_name} (ID: {song_id})")
            
            # Extract team composition data
            # Look for card IDs in the data
            card_ids = []
            for i, row in enumerate(rows):
                if len(row) > 35 and row[33] == 'ID':
                    # Next row should contain the actual IDs
                    if i+1 < len(rows) and len(rows[i+1]) > 39:
                        for j in range(34, 40):  # Positions 34-39 typically contain card IDs
                            card_id = parse_value(rows[i+1][j], int)
                            if card_id:
                                card_ids.append(card_id)
                    break
            
            # Extract score values
            attribute_score = None
            scoreup_score = None
            reduction_score = None
            live_end_score = None
            final_score = None
            
            for i, row in enumerate(rows):
                if len(row) > 2:
                    if row[1] == '属性値スコア':
                        attribute_score = parse_value(row[3].replace(',', ''), int) if len(row) > 3 else None
                    elif row[1] == 'スコアアップスキル':
                        scoreup_score = parse_value(row[3].replace(',', ''), int) if len(row) > 3 else None
                    elif row[1] == '縮小スキル':
                        reduction_score = parse_value(row[3].replace(',', ''), int) if len(row) > 3 else None
                    elif row[1] == 'ライブ終了時':
                        live_end_score = parse_value(row[3].replace(',', ''), int) if len(row) > 3 else None
                    elif row[1] == '最終リザルト':
                        final_score = parse_value(row[3].replace(',', ''), int) if len(row) > 3 else None
            
            # Insert team composition if we have card data
            if len(card_ids) >= 6 and song_id:
                cur.execute("""
                    INSERT INTO i7card.team_compositions (
                        song_id, position1_card_id, position2_card_id,
                        position3_card_id, position4_card_id, position5_card_id,
                        position6_card_id, attribute_score, scoreup_skill_score,
                        reduction_skill_score, live_end_score, final_result_score
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    song_id, card_ids[0], card_ids[1], card_ids[2],
                    card_ids[3], card_ids[4], card_ids[5],
                    attribute_score, scoreup_score, reduction_score,
                    live_end_score, final_score
                ))
                print("Imported team composition data")
        
        conn.commit()
        print("Score calculation data import completed")
        return True
        
    except Exception as e:
        print(f"Error importing score calculation data: {e}")
        conn.rollback()
        return False
    finally:
        cur.close()

def main():
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
        
        # Import main card data (Sheet 1)
        try:
            csv_data1 = fetch_csv_data(SHEET1_GID)
            import_main_card_data(csv_data1, conn)
        except Exception as e:
            print(f"Error importing main card data: {e}")
        
        # Import game mechanics data (Sheet 2)
        try:
            csv_data2 = fetch_csv_data(SHEET2_GID)
            import_game_mechanics_data(csv_data2, conn)
        except Exception as e:
            print(f"Error importing game mechanics data: {e}")
            print("This might be expected if the second sheet has a different structure")
        
        # Import score calculation data (Sheet 3)
        try:
            csv_data3 = fetch_csv_data(SHEET3_GID)
            import_score_calculation_data(csv_data3, conn)
        except Exception as e:
            print(f"Error importing score calculation data: {e}")
            print("This might be expected if the third sheet has a different structure")
        
        print("\nAll data import completed!")
        
        conn.close()
        
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()