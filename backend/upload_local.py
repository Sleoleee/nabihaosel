import sys
import argparse
import io
from dotenv import load_dotenv
import os

load_dotenv()

from utils.parser import parse_excel
from utils.db import get_client

def upload_file(filepath, mode="replace"):
    print(f"Membaca file: {filepath}")
    with open(filepath, "rb") as f:
        file_bytes = io.BytesIO(f.read())

    print("Parsing Excel...")
    parsed = parse_excel(file_bytes)

    if not parsed:
        print("ERROR: Tidak ada sheet 'sales detail YYYY' yang ditemukan")
        return

    db = get_client()
    total_imported = 0
    total_skipped = 0

    for year, (records, skipped) in parsed.items():
        print(f"Tahun {year}: {len(records)} baris valid, {skipped} dilewati")
        total_skipped += skipped

        if mode == "replace":
            print(f"Menghapus data tahun {year} yang lama...")
            db.table("transactions").delete().eq("year", year).neq("id", -1).execute()

        CHUNK = 200
        for i in range(0, len(records), CHUNK):
            chunk = records[i:i+CHUNK]
            db.table("transactions").insert(chunk).execute()
            print(f"  Upload {i+len(chunk)}/{len(records)} baris...")

        total_imported += len(records)

    db.table("upload_history").insert({
        "filename": os.path.basename(filepath),
        "rows_imported": total_imported,
        "rows_skipped": total_skipped,
        "years_covered": [str(y) for y in parsed.keys()],
        "replace_mode": mode == "replace",
    }).execute()

    print(f"\nSELESAI! Total import: {total_imported} baris, dilewati: {total_skipped} baris")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("filepath", help="Path ke file .xlsx")
    parser.add_argument("--mode", choices=["upsert", "replace"], default="upsert")
    args = parser.parse_args()

    if not os.path.exists(args.filepath):
        print(f"ERROR: File tidak ditemukan: {args.filepath}")
        sys.exit(1)

    upload_file(args.filepath, mode=args.mode)