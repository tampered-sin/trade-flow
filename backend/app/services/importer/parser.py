import pandas as pd
import io
from fastapi import UploadFile, HTTPException

async def parse_file(file: UploadFile) -> pd.DataFrame:
    """
    Parses an uploaded file into a pandas DataFrame.
    Supports .csv, .xls, .xlsx.
    Handles CSV encoding retries.
    """
    filename = file.filename.lower()
    content = await file.read()

    try:
        if filename.endswith(('.xls', '.xlsx')):
            return pd.read_excel(io.BytesIO(content))

        elif filename.endswith('.csv'):
            # Try default utf-8 first
            try:
                return pd.read_csv(io.BytesIO(content))
            except UnicodeDecodeError:
                # Retry with other encodings
                encodings = ['latin1', 'cp1252', 'iso-8859-1']
                delimiters = [',', ';', '\t', '|']

                for encoding in encodings:
                    try:
                        # Simple retry with encoding
                        return pd.read_csv(io.BytesIO(content), encoding=encoding)
                    except UnicodeDecodeError:
                        continue
                    except Exception:
                        # If encoding works but parsing fails, try sniffing delimiter
                        try:
                            text = content.decode(encoding)
                            # Try to sniff delimiter
                            import csv
                            sniffer = csv.Sniffer()
                            dialect = sniffer.sniff(text[:1024])
                            return pd.read_csv(io.StringIO(text), delimiter=dialect.delimiter)
                        except Exception:
                            continue

                # If all fails
                raise HTTPException(status_code=400, detail="Could not decode CSV file. Please ensure it is a valid CSV.")

        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload .csv, .xls, or .xlsx.")

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error parsing file: {str(e)}")
