#!/usr/bin/env python3
import csv
import requests
from io import StringIO

# Google Sheets CSV export URL
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
GID = "480354522"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

def check_sheet_structure():
    """Check the structure of the new Google Sheets"""
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
            print(f"{i+1}. {header}")
        
        # Get first few rows for preview
        print("\nFirst 3 rows of data:")
        for i, row in enumerate(reader):
            if i >= 3:
                break
            print(f"\nRow {i+1}:")
            for key, value in row.items():
                if value:  # Only print non-empty values
                    print(f"  {key}: {value}")
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_sheet_structure()