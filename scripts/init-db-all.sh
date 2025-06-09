#!/bin/sh
set -e

echo "Waiting for PostgreSQL to be ready..."
sleep 5

echo "Installing Python dependencies..."
pip install requests psycopg2-binary

echo "Running complete database import for all sheets..."

# Check if the new import script exists
if [ -f "/scripts/import_all_data.py" ]; then
    echo "Using new comprehensive import script..."
    python /scripts/import_all_data.py
else
    echo "Falling back to old import script..."
    python /scripts/fetch_all_sheets_data.py
fi

echo "Database initialization complete!"