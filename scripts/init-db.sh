#!/bin/sh
set -e

echo 'Installing dependencies...'
pip install requests psycopg2-binary

echo 'Waiting for database to be ready...'
sleep 10

echo 'Checking if schema exists...'
python -c "
import psycopg2
import time
import sys

try:
    conn = psycopg2.connect(host='postgres', port=5432, dbname='i7card', user='i7user', password='i7password')
    cur = conn.cursor()
    
    # Wait for schema to be created
    for i in range(30):
        cur.execute(\"SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = 'i7card')\")
        if cur.fetchone()[0]:
            print('Schema i7card found!')
            break
        print(f'Waiting for schema... ({i+1}/30)')
        time.sleep(2)
    else:
        print('Schema not found after 60 seconds')
        sys.exit(1)
        
    cur.close()
    conn.close()
except Exception as e:
    print(f'Error checking schema: {e}')
    sys.exit(1)
"

echo 'Running data import script...'
python /scripts/fetch_sheets_data.py

echo 'Data import completed!'