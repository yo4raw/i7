#!/usr/bin/env python3
"""Verify the imported data"""
import psycopg2
import os

# Database connection
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'i7card')
DB_USER = os.environ.get('DB_USER', 'i7user')
DB_PASS = os.environ.get('DB_PASS', 'i7password')

try:
    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        dbname=DB_NAME,
        user=DB_USER,
        password=DB_PASS
    )
    
    cur = conn.cursor()
    
    # Check main cards
    cur.execute("SELECT COUNT(*) FROM i7card.cards")
    main_cards = cur.fetchone()[0]
    print(f"Main cards: {main_cards}")
    
    # Check songs
    cur.execute("SELECT COUNT(*) FROM i7card.songs")
    songs = cur.fetchone()[0]
    print(f"Songs: {songs}")
    
    # Check group cards
    cur.execute("SELECT COUNT(*) FROM i7card.group_cards")
    group_cards = cur.fetchone()[0]
    print(f"Group cards: {group_cards}")
    
    # Sample some group cards
    cur.execute("SELECT id, cardname, group_name FROM i7card.group_cards LIMIT 5")
    print("\nSample group cards:")
    for row in cur.fetchall():
        print(f"  ID: {row[0]}, Name: {row[1]}, Group: {row[2]}")
    
    # Sample some songs
    cur.execute("SELECT song_id, song_name, artist_name FROM i7card.songs LIMIT 5")
    print("\nSample songs:")
    for row in cur.fetchall():
        print(f"  ID: {row[0]}, Song: {row[1]}, Artist: {row[2]}")
    
    cur.close()
    conn.close()
    
except Exception as e:
    print(f"Error: {e}")