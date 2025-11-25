import asyncio
import os
import sys
from datetime import datetime

# Add backend to path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.services.importer.normalizer import normalize_headers, detect_mapping
from app.services.importer.processor import process_rows
import pandas as pd

# Mock Data
GROWW_CSV_CONTENT = """Date,Product,Buy/Sell,Quantity,Price,Value,Brokerage Charged,Order ID,Exchange,Remarks
2023-10-27 10:30:00,RELIANCE,Buy,10,2300.50,23005.00,20.00,ORD12345,NSE,Test Trade
2023-10-27 11:15:00,TCS,Sell,5,3400.00,17000.00,15.00,ORD67890,BSE,
"""

KNOWN_MAPPINGS = [
    {
        "id": "groww_v1",
        "display_name": "Groww v1",
        "file_name_patterns": ["groww", "grow"],
        "column_map": {
            "Date": {"to": "trade_time", "fmt": "%Y-%m-%d %H:%M:%S"},
            "Product": {"to": "symbol"},
            "Buy/Sell": {"to": "side", "mappings": {"Buy": "BUY", "Sell": "SELL", "BUY": "BUY"}},
            "Quantity": {"to": "quantity"},
            "Price": {"to": "price"},
            "Value": {"to": "gross_value"},
            "Brokerage Charged": {"to": "fees"},
            "Order Id": {"to": "source_row_id"},
            "Exchange": {"to": "exchange"},
            "Remarks": {"to": "tags.remarks"}
        },
        "heuristics": {
            "date_formats": ["%Y-%m-%d %H:%M:%S", "%d/%m/%Y %H:%M"],
            "numeric_cleanup": ["strip_commas", "remove_currency_symbols", "parentheses_negative"],
            "symbol_strip_suffixes": [".NS", ".BO", " - NSE"]
        }
    }
]

async def test_pipeline():
    print("--- Testing Importer Pipeline ---")

    # 1. Simulate File Read
    print("\n1. Reading CSV...")
    from io import StringIO
    df = pd.read_csv(StringIO(GROWW_CSV_CONTENT))
    print(f"Read {len(df)} rows.")

    # 2. Normalize Headers
    print("\n2. Normalizing Headers...")
    headers = df.columns.tolist()
    normalized = normalize_headers(headers)
    print(f"Original: {headers}")
    print(f"Normalized: {normalized}")
    df.columns = normalized

    # 3. Detect Mapping
    print("\n3. Detecting Mapping...")
    mapping, confidence = detect_mapping(normalized, "groww_export.csv", KNOWN_MAPPINGS)
    print(f"Detected: {mapping['display_name']} (Confidence: {confidence})")
    assert confidence > 0.7

    # 4. Process Rows
    print("\n4. Processing Rows...")
    valid_rows, errors = process_rows(df, mapping, "user_123", "Groww")
    print(f"Valid Rows: {len(valid_rows)}")
    print(f"Errors: {len(errors)}")

    if errors:
        print("Errors found:", errors)

    # Verify Row 1
    row1 = valid_rows[0]
    print("\nRow 1 Data:")
    print(row1)

    assert row1["symbol"] == "RELIANCE"
    assert row1["side"] == "BUY"
    assert row1["quantity"] == 10.0
    assert row1["price"] == 2300.50
    assert row1["gross_value"] == 23005.00
    assert row1["fees"] == 20.0
    assert row1["source_row_id"] == "ORD12345"
    assert "tags" in row1
    assert "remarks:Test Trade" in row1["tags"]
    assert "import_hash" in row1

    print("\n--- Test Passed ---")

if __name__ == "__main__":
    asyncio.run(test_pipeline())
