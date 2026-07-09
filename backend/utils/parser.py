import openpyxl
import re
from datetime import datetime
from typing import Dict, List, Tuple


COLUMN_MAP = {
    "Document Status": "document_status",
    "Canceled": "canceled",
    "Document Number": "document_number",
    "Posting Date": "posting_date",
    "Due Date": "due_date",
    "Customer/Vendor_Code": "customer_code",
    "Customer/Vendor_Name": "customer_name",
    "Item_No.": "item_no",
    "Item/Service_Description": "item_description",
    "Kategori": "kategori",
    "Warehouse Code": "warehouse_code",
    "Quantity": "quantity",
    "Unit": "unit",
    "harga_awal": "harga_awal",
    "Disc % Per Row": "disc_per_row",
    "harga_jual": "harga_jual",
    "Row Total": "row_total",
    "Disc % For Document": "disc_for_document",
    "New_Row_Total": "new_row_total",
    "SlpName": "slp_name",
    "Branch": "branch",
    "Status_payment": "status_payment",
}

NUMERIC_COLS = {"harga_awal", "disc_per_row", "harga_jual", "row_total",
                "disc_for_document", "new_row_total", "quantity"}
INT_COLS = {"document_number"}
DATE_COLS = {"posting_date", "due_date"}
OUTPUT_COLS = [
    "document_number", "posting_date", "due_date", "customer_code",
    "customer_name", "item_no", "item_description", "kategori",
    "warehouse_code", "quantity", "unit", "harga_awal", "disc_per_row",
    "harga_jual", "row_total", "disc_for_document", "new_row_total",
    "slp_name", "branch", "status_payment", "year",
]


def _to_float(val):
    if val is None:
        return 0.0
    try:
        return float(val)
    except (TypeError, ValueError):
        return 0.0


def _to_int(val):
    if val is None:
        return None
    try:
        return int(float(val))
    except (TypeError, ValueError):
        return None


def _to_date(val):
    if val is None:
        return None
    if isinstance(val, datetime):
        return val.date().isoformat()
    if hasattr(val, 'isoformat'):
        return val.isoformat()
    try:
        return datetime.fromisoformat(str(val)).date().isoformat()
    except Exception:
        return None


def parse_excel(file_bytes: bytes) -> Dict[int, Tuple[List[dict], int]]:
    """
    Returns dict: {year: (records, skipped_count)}
    Streams rows without building a full DataFrame to minimize memory usage.
    """
    wb = openpyxl.load_workbook(filename=file_bytes, read_only=True, data_only=True)
    results = {}

    for sheet_name in wb.sheetnames:
        match = re.match(r"sales detail (\d{4})", sheet_name, re.IGNORECASE)
        if not match:
            continue
        year = int(match.group(1))

        ws = wb[sheet_name]
        rows_iter = ws.iter_rows(values_only=True)

        try:
            header_row = next(rows_iter)
        except StopIteration:
            continue

        # Build index map: excel column name -> db column name -> position
        col_index = {}
        for i, h in enumerate(header_row):
            if h is None:
                continue
            h_str = str(h).strip()
            db_name = COLUMN_MAP.get(h_str)
            if db_name:
                col_index[db_name] = i

        records = []
        skipped = 0

        def get_cell(row, col):
            idx = col_index.get(col)
            if idx is None or idx >= len(row):
                return None
            return row[idx]

        for row in rows_iter:
            # Filter: skip canceled rows
            canceled_val = get_cell(row, "canceled")
            if canceled_val is not None and str(canceled_val).strip().upper() != "N":
                skipped += 1
                continue

            # Filter: skip zero/negative new_row_total
            nrt = _to_float(get_cell(row, "new_row_total"))
            if nrt <= 0:
                skipped += 1
                continue

            rec = {"year": year}
            for col in OUTPUT_COLS:
                if col == "year":
                    continue
                val = get_cell(row, col)
                if col in INT_COLS:
                    rec[col] = _to_int(val)
                elif col in NUMERIC_COLS:
                    rec[col] = _to_float(val)
                elif col in DATE_COLS:
                    rec[col] = _to_date(val)
                else:
                    rec[col] = str(val).strip() if val is not None else None

            records.append(rec)

        results[year] = (records, skipped)

    wb.close()
    return results
