import openpyxl
import pandas as pd
import re
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


def parse_excel(file_bytes: bytes) -> Dict[int, Tuple[List[dict], int]]:
    """
    Returns dict: {year: (records, skipped_count)}
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

        headers = [str(h).strip() if h is not None else "" for h in header_row]
        data_rows = list(rows_iter)

        if not data_rows:
            continue

        df = pd.DataFrame(data_rows, columns=headers)

        # Rename columns
        rename = {k: v for k, v in COLUMN_MAP.items() if k in df.columns}
        df = df.rename(columns=rename)

        total_before = len(df)

        # Filter
        if "canceled" in df.columns:
            df = df[df["canceled"] == "N"]
        if "new_row_total" in df.columns:
            df["new_row_total"] = pd.to_numeric(df["new_row_total"], errors="coerce").fillna(0)
            df = df[df["new_row_total"] > 0]

        skipped = total_before - len(df)

        # Type coercions
        numeric_cols = ["harga_awal", "disc_per_row", "harga_jual", "row_total", "disc_for_document", "new_row_total", "quantity"]
        for col in numeric_cols:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0)

        if "posting_date" in df.columns:
            df["posting_date"] = pd.to_datetime(df["posting_date"], errors="coerce")
        if "due_date" in df.columns:
            df["due_date"] = pd.to_datetime(df["due_date"], errors="coerce")

        if "document_number" in df.columns:
            df["document_number"] = pd.to_numeric(df["document_number"], errors="coerce")

        df["year"] = year

        # Convert to records
        records = []
        for _, row in df.iterrows():
            rec = {}
            for col in ["document_number", "posting_date", "due_date", "customer_code",
                        "customer_name", "item_no", "item_description", "kategori",
                        "warehouse_code", "quantity", "unit", "harga_awal", "disc_per_row",
                        "harga_jual", "row_total", "disc_for_document", "new_row_total",
                        "slp_name", "branch", "status_payment", "year"]:
                val = row.get(col)
                if pd.isna(val) if not isinstance(val, str) else False:
                    rec[col] = None
                elif isinstance(val, pd.Timestamp):
                    rec[col] = val.date().isoformat()
                else:
                    rec[col] = val
            records.append(rec)

        results[year] = (records, skipped)

    wb.close()
    return results
