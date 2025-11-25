import pandas as pd
import re
from datetime import datetime
from hashlib import sha256
from typing import List, Dict, Any, Tuple
from uuid import uuid4

def process_rows(df: pd.DataFrame, mapping: Dict[str, Any], user_id: str, broker_name: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Processes rows from the DataFrame based on the provided mapping.
    Returns (valid_rows, errors).
    """
    valid_rows = []
    errors = []

    column_map = mapping.get("column_map", {})
    heuristics = mapping.get("heuristics", {})

    # Pre-compile regex for numeric cleanup
    currency_regex = re.compile(r'[^0-9\-\.\(\),]')

    for idx, row in df.iterrows():
        try:
            processed_row = {
                "id": uuid4(),
                "user_id": user_id,
                "created_at": datetime.utcnow(),
                "tags": []
            }

            # Track which source columns are mapped
            mapped_source_cols = set()

            # Apply mappings
            for source_col, target_config in column_map.items():
                if source_col not in df.columns:
                    continue

                mapped_source_cols.add(source_col)
                target_field = target_config.get("to")
                value = row[source_col]

                # Skip if value is null/nan
                if pd.isna(value) or value == "":
                    continue

                # Handle nested fields (e.g., tags.remarks)
                if target_field.startswith("tags."):
                    tag_key = target_field.split(".")[1]
                    processed_row["tags"].append(f"{tag_key}:{value}")
                    continue

                # Type conversion based on target field
                if target_field in ["trade_time", "entry_time", "exit_time"]:
                    fmt = target_config.get("fmt")
                    if fmt:
                        try:
                            processed_row[target_field] = pd.to_datetime(value, format=fmt)
                        except:
                            processed_row[target_field] = pd.to_datetime(value, errors='coerce')
                    else:
                        processed_row[target_field] = pd.to_datetime(value, errors='coerce')

                elif target_field in ["price", "quantity", "gross_value", "fees", "entry_price", "exit_price", "pnl"]:
                    # Numeric cleanup
                    val_str = str(value).strip()
                    # Remove currency symbols
                    val_str = currency_regex.sub('', val_str)
                    # Handle parentheses for negative
                    if val_str.startswith('(') and val_str.endswith(')'):
                        val_str = '-' + val_str[1:-1]
                    # Remove commas
                    val_str = val_str.replace(',', '')

                    try:
                        processed_row[target_field] = float(val_str)
                    except:
                        processed_row[target_field] = None

                elif target_field == "side":
                    # Side mapping
                    side_map = target_config.get("mappings", {})
                    val_str = str(value).strip()
                    if val_str in side_map:
                        processed_row[target_field] = side_map[val_str]
                    else:
                        # Default heuristics
                        val_upper = val_str.upper()
                        if val_upper in ['B', 'BUY', 'BUY ']:
                            processed_row[target_field] = "BUY"
                        elif val_upper in ['S', 'SELL']:
                            processed_row[target_field] = "SELL"
                        else:
                            processed_row[target_field] = val_upper

                elif target_field == "symbol":
                    # Symbol normalization
                    val_str = str(value).strip().upper()
                    # Strip suffixes
                    for suffix in heuristics.get("symbol_strip_suffixes", []):
                        if val_str.endswith(suffix):
                            val_str = val_str[:-len(suffix)]
                    # Remove " - NSE" style
                    val_str = val_str.split(' - ')[0]
                    processed_row[target_field] = val_str

                else:
                    # Default string
                    processed_row[target_field] = str(value).strip()

            # Handle unmapped columns -> tags
            for col in df.columns:
                if col not in mapped_source_cols:
                    val = row[col]
                    if not pd.isna(val) and val != "":
                        processed_row["tags"].append(f"{col}:{val}")

            # Derived values
            qty = processed_row.get("quantity", 0)
            price = processed_row.get("price") or processed_row.get("entry_price")
            gross = processed_row.get("gross_value")

            if gross is None and qty and price:
                processed_row["gross_value"] = qty * price

            if price is None and gross and qty and qty != 0:
                processed_row["entry_price"] = gross / qty
                processed_row["price"] = gross / qty # Ensure price is set

            # Map generic 'price' to 'entry_price' if not set
            if "entry_price" not in processed_row and "price" in processed_row:
                processed_row["entry_price"] = processed_row["price"]

            # Map generic 'trade_time' to 'entry_time' if not set
            if "entry_time" not in processed_row and "trade_time" in processed_row:
                processed_row["entry_time"] = processed_row["trade_time"]

            # Validation
            if "entry_time" not in processed_row or pd.isna(processed_row["entry_time"]):
                errors.append(f"Row {idx}: Missing trade_time")
                continue
            if "symbol" not in processed_row or not processed_row["symbol"]:
                errors.append(f"Row {idx}: Missing symbol")
                continue
            if "side" not in processed_row or processed_row["side"] not in ["BUY", "SELL"]:
                errors.append(f"Row {idx}: Invalid side {processed_row.get('side')}")
                continue

            # Compute import_hash
            # key = f"{broker}|{symbol}|{trade_time_rounded_iso}|{quantity or ''}|{round(price or 0,8)}"
            trade_time = processed_row["entry_time"]
            # Round to nearest second
            if trade_time.microsecond >= 500000:
                trade_time = trade_time.replace(microsecond=0) # Simple truncation for now, or use proper rounding
            else:
                trade_time = trade_time.replace(microsecond=0)

            price_val = processed_row.get("entry_price", 0)
            qty_val = processed_row.get("quantity", "")

            key = f"{broker_name}|{processed_row['symbol']}|{trade_time.isoformat()}|{qty_val}|{round(price_val, 8)}"
            processed_row["import_hash"] = sha256(key.encode('utf-8')).hexdigest()

            valid_rows.append(processed_row)

        except Exception as e:
            errors.append(f"Row {idx}: Processing error - {str(e)}")

    return valid_rows, errors
