#!/usr/bin/env python3
import csv
import requests
from io import StringIO

# Google Sheets CSV export URL for third sheet
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
GID = "1555231665"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

def check_sheet_structure():
    """Check the structure of the third Google Sheet"""
    print(f"Fetching data from: {SHEET_URL}")
    
    try:
        response = requests.get(SHEET_URL)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        csv_file = StringIO(response.text)
        reader = csv.DictReader(csv_file)
        
        # Get the headers
        headers = reader.fieldnames
        print(f"\nFound {len(headers)} columns:")
        for i, header in enumerate(headers):
            if header:  # Only print non-empty headers
                print(f"{i+1}. {header}")
        
        # Get first few rows for preview
        print("\nFirst 5 rows of data:")
        for i, row in enumerate(reader):
            if i >= 5:
                break
            print(f"\nRow {i+1}:")
            # Only print non-empty values
            non_empty = {k: v for k, v in row.items() if v and k}
            if non_empty:
                for key, value in non_empty.items():
                    print(f"  {key}: {value}")
            else:
                print("  (empty row)")
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_sheet_structure()