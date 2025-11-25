from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from uuid import uuid4


router = APIRouter()

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Body
from sqlalchemy.ext.asyncio import AsyncSession
from ..deps import get_db, get_current_user
from ..services.importer.parser import parse_file
from ..services.importer.normalizer import normalize_headers, detect_mapping
from ..services.importer.processor import process_rows
from ..services.importer.storage import bulk_upsert_trades
import json

router = APIRouter()

# Known mappings (could be moved to DB or config)
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

@router.post("/csv")
async def import_csv(
    file: UploadFile = File(...),
    mapping_override: str | None = Body(None),
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user)
):
    # 1. Parse File
    try:
        df = await parse_file(file)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # 2. Normalize Headers
    original_headers = df.columns.tolist()
    normalized_headers = normalize_headers(original_headers)
    df.columns = normalized_headers

    # 3. Detect Mapping
    if mapping_override:
        try:
            mapping = json.loads(mapping_override)
            confidence = 1.0
        except:
            raise HTTPException(status_code=400, detail="Invalid mapping JSON")
    else:
        mapping, confidence = detect_mapping(normalized_headers, file.filename, KNOWN_MAPPINGS)

    # If confidence is low, return preview for manual mapping
    if not mapping or confidence < 0.7:
        preview_rows = df.head(10).to_dict(orient="records")
        return {
            "status": "mapping_required",
            "headers": normalized_headers,
            "preview": preview_rows,
            "confidence": confidence,
            "suggested_mapping": mapping
        }

    # 4. Process Rows
    valid_rows, errors = process_rows(df, mapping, str(user.id), "Groww") # Broker name should ideally come from mapping or user input

    # 5. Bulk Upsert
    imported_count = await bulk_upsert_trades(db, valid_rows)

    return {
        "status": "success",
        "imported": imported_count,
        "total_rows": len(df),
        "valid_rows": len(valid_rows),
        "errors": errors[:50], # Return first 50 errors
        "mapping_used": mapping.get("display_name", "Custom")
    }
