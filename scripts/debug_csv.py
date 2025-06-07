#!/usr/bin/env python3
import csv
import requests
from io import StringIO

# Google Sheets CSV export URL
SHEET_ID = "1LifgqDiRlQOIhP8blqEngJhI_Nnagbo8uspwmfg72fY"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid=0"

def debug_csv():
    """Debug CSV structure"""
    print("Fetching data from Google Sheets...")
    response = requests.get(SHEET_URL)
    response.raise_for_status()
    
    csv_data = response.text
    csv_file = StringIO(csv_data)
    reader = csv.DictReader(csv_file)
    
    # Print headers
    print("\nCSV Headers:")
    headers = reader.fieldnames
    for i, header in enumerate(headers):
        print(f"{i}: '{header}'")
    
    # Print first 5 rows
    print("\nFirst 5 rows:")
    for i, row in enumerate(reader):
        if i >= 5:
            break
        print(f"\nRow {i+1}:")
        for key, value in row.items():
            if value:  # Only print non-empty values
                print(f"  {key}: {value}")

if __name__ == "__main__":
    debug_csv()