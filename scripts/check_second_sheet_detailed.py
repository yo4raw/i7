#!/usr/bin/env python3
import requests

# Google Sheets CSV export URL for second sheet
SHEET_ID = "1UxM2ekw7KlTTbCfPFMa6ihywrUMTryP5Zrv1DVEUKy4"
GID = "1083871743"
SHEET_URL = f"https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv&gid={GID}"

def check_sheet_structure():
    """Check the structure of the second Google Sheet"""
    print(f"Fetching data from: {SHEET_URL}")
    
    try:
        response = requests.get(SHEET_URL)
        response.raise_for_status()
        response.encoding = 'utf-8'
        
        # Print first 20 lines to see the structure
        lines = response.text.split('\n')
        for i, line in enumerate(lines[:20]):
            print(f"Line {i}: {line[:200]}")  # First 200 chars of each line
                    
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_sheet_structure()