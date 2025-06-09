#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
sleep 5

echo "Installing Python dependencies..."
pip install requests psycopg2-binary

echo "Running database import for all sheets..."
python /scripts/fetch_all_sheets_data.py

echo "Database initialization complete!"