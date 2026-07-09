"""
Script upload lokal - jalankan dari folder backend/
Usage: python upload_local.py "path/to/file.xlsx" [--mode upsert|replace]
"""
import sys
import os
import argparse
from dotenv import load_dotenv

load_dotenv()

from utils.db import get_client
from utils.parser import parse_excel

CHUNK_SIZE = 500


def upload_file(filepath: str, mode: str = "upsert"):
    print(f"Membaca file: {filepath}")
    with open(filepath, "rb") as f:
        import io
        file_bytes = io.BytesIO(f.read())

    print("Parsing Excel...")
    parsed = parse_excel(file_bytes)

    if not parsed:
        print("ERROR: Tidak ada sheet 'sales detail YYYY' yang valid.")
        return

    db = get_client()
    total_imported = 0
    total_skipped = 0
    years_covered = []

    for year, (records, skipped) in parsed.items():
        print(f"Tahun {year}: {len(records)} baris valid, {skipped} dilewati")
        years_covered.append(year)
        total_skipped += skipped

        if mode == "replace":
            print(f"Menghapus data tahun {year} yang lama...")
            # Use gt(0) to satisfy PostgREST requirement for a filter on DELETE
            db.table("transactions").delete().eq("year", year).gt("id", 0).execute()

        print(f"Mengimpor {len(records)} baris untuk tahun {year}...")
        for i in range(0, len(records), CHUNK_SIZE):
            chunk = records[i:i + CHUNK_SIZE]
            db.table("transactions").insert(chunk).execute()
            pct = min(i + CHUNK_SIZE, len(records))
            print(f"  {pct}/{len(records)} baris...", end="\r")
        print(f"  {len(records)}/{len(records)} baris selesai.")
        total_imported += len(records)

    print(f"\nMencatat riwayat upload...")
    filename = os.path.basename(filepath)
    db.table("upload_history").insert({
        "filename": filename,
        "rows_imported": total_imported,
        "rows_skipped": total_skipped,
        "years_covered": [str(y) for y in years_covered],
        "replace_mode": mode == "replace",
    }).execute()

    print(f"\nSelesai!")
    print(f"  Diimpor : {total_imported} baris")
    print(f"  Dilewati: {total_skipped} baris")
    print(f"  Tahun   : {sorted(years_covered)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("filepath", help="Path ke file .xlsx")
    parser.add_argument("--mode", choices=["upsert", "replace"], default="replace",
                        help="upsert = tambah data, replace = hapus dulu lalu impor (default: replace)")
    args = parser.parse_args()

    if not os.path.exists(args.filepath):
        print(f"ERROR: File tidak ditemukan: {args.filepath}")
        sys.exit(1)

    upload_file(args.filepath, mode=args.mode)
