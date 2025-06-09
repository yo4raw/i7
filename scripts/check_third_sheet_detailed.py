#!/usr/bin/env python3
import csv
import requests
from io import StringIO

# Google Sheets CSV export URL for third sheet
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
GID = "1555231665"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

def check_sheet_structure():
    """Check the structure of the third Google Sheet in detail"""
    print(f"Fetching data from: {SHEET_URL}")
    
    try:
        response = requests.get(SHEET_URL)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        # Split into lines to see raw structure
        lines = response.text.split('\n')
        
        print(f"\nTotal lines: {len(lines)}")
        print("\nFirst 30 lines (first 200 chars each):")
        for i, line in enumerate(lines[:30]):
            if line.strip():  # Only print non-empty lines
                preview = line[:200] + "..." if len(line) > 200 else line
                print(f"Line {i}: {preview}")
        
        # Also try to parse as CSV
        print("\n\nParsing as CSV:")
        csv_file = StringIO(response.text)
        reader = csv.reader(csv_file)
        
        for i, row in enumerate(reader):
            if i >= 20:  # Look at first 20 rows
                break
            # Filter out empty cells
            non_empty = [cell for cell in row if cell.strip()]
            if non_empty:
                print(f"\nRow {i}: {len(row)} cells, {len(non_empty)} non-empty")
                print(f"  Content: {non_empty[:10]}")  # Show first 10 non-empty cells
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_sheet_structure()