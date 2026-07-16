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

CHUNK_SIZE = 2000


def upload_file(filepath: str, mode: str = "upsert", chunk_size: int = CHUNK_SIZE):
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
            try:
                # PostgREST requires 2+ filters on DELETE; use neq as dummy second filter
                db.table("transactions").delete().eq("year", year).neq("id", -1).execute()
            except Exception as e:
                print(f"  PERINGATAN: Tidak bisa hapus data lama ({e})")
                print(f"  Lanjut insert tanpa menghapus data lama...")
                print(f"  (Untuk hapus manual: DELETE FROM transactions WHERE year = {year};)")
                print(f"  Jalankan perintah SQL itu di Supabase SQL Editor lalu coba lagi.")

        print(f"Mengimpor {len(records)} baris untuk tahun {year} (batch {chunk_size})...")
        for i in range(0, len(records), chunk_size):
            chunk = records[i:i + chunk_size]
            db.table("transactions").insert(chunk).execute()
            pct = min(i + chunk_size, len(records))
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
    parser.add_argument("--chunk", type=int, default=CHUNK_SIZE,
                        help=f"Jumlah baris per batch insert (default: {CHUNK_SIZE}). "
                             f"Makin besar makin cepat, tapi kalau error 'payload too large' turunkan lagi.")
    args = parser.parse_args()

    if not os.path.exists(args.filepath):
        print(f"ERROR: File tidak ditemukan: {args.filepath}")
        sys.exit(1)

    upload_file(args.filepath, mode=args.mode, chunk_size=args.chunk)
