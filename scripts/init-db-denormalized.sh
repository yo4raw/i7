#!/bin/bash
# Initialize database with denormalized data from Google Sheets

echo "Starting denormalized data import from Google Sheets..."

# Install required Python packages
pip install requests psycopg2-binary

# Run the denormalized import script
python /scripts/import_all_data_denormalized.py

echo "Denormalized data import completed!"