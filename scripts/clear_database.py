#!/usr/bin/env python3
import psycopg2
import os
import sys

# Database connection
DB_HOST = os.environ.get('DB_HOST', 'postgres')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'i7card')
DB_USER = os.environ.get('DB_USER', 'i7user')
DB_PASS = os.environ.get('DB_PASS', 'i7password')

def clear_database():
    """Clear all data from the database tables"""
    try:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            dbname=DB_NAME,
            user=DB_USER,
            password=DB_PASS
        )
        cur = conn.cursor()
        
        print("Clearing database tables...")
        
        # Delete data in reverse order of foreign key dependencies
        tables = [
            'skill_guess',
            'broach_info',
            'release_info',
            'skill_details',
            'card_skills',
            'card_stats',
            'cards'
        ]
        
        for table in tables:
            try:
                cur.execute(f"DELETE FROM i7card.{table}")
                count = cur.rowcount
                print(f"Deleted {count} rows from {table}")
            except Exception as e:
                print(f"Error clearing {table}: {e}")
        
        conn.commit()
        print("Database cleared successfully!")
        
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error connecting to database: {e}")
        sys.exit(1)

if __name__ == "__main__":
    response = input("Are you sure you want to clear all data from the database? (yes/no): ")
    if response.lower() == 'yes':
        clear_database()
    else:
        print("Operation cancelled.")