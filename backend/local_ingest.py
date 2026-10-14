"""
Ingest file Excel -> SQLite lokal (data_local/transactions.db).
Menggantikan upload data mentah ke Supabase. Pakai parser dashboard (teruji).

  python local_ingest.py "file1.xlsx" "file2.xlsx" ...        # tambah (append)
  python local_ingest.py --reset "a.xlsx" "b.xlsx" "c.xlsx"    # kosongkan dulu, lalu isi
  python local_ingest.py --branch "1.BLOOMIE" "bloomie.xlsx"   # paksa branch semua baris
  python local_ingest.py --only-year 2026 "ar2026.xlsx"        # hanya tahun tertentu

Setelah ingest, jalankan build_analytics.py untuk mendorong agregat ke Supabase.
"""
import sys, os, io, argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from utils.parser import parse_excel
import local_store


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--reset", action="store_true", help="kosongkan tabel lokal dulu")
    ap.add_argument("--branch", default=None, help="paksa nilai branch semua baris")
    ap.add_argument("--only-year", type=int, default=None)
    args = ap.parse_args()

    conn = local_store.connect()
    local_store.ensure_schema(conn)
    if args.reset:
        conn.execute("DELETE FROM transactions"); conn.commit()
        print("Tabel lokal dikosongkan (--reset).")

    grand = 0
    for path in args.files:
        if not os.path.exists(path):
            print(f"  ! lewati (tak ada): {path}"); continue
        print(f"Parsing: {path}")
        with open(path, "rb") as f:
            parsed = parse_excel(io.BytesIO(f.read()))
        if not parsed:
            print("  ! tak ada sheet transaksi valid."); continue
        for year, (records, skipped) in parsed.items():
            if args.only_year is not None and year != args.only_year:
                continue
            if args.branch:
                for r in records:
                    r["branch"] = args.branch
            n = local_store.insert_rows(conn, records)
            grand += n
            print(f"  tahun {year}: +{n} baris (skip {skipped})")

    total = local_store.count(conn)
    conn.close()
    print(f"\n✓ Ditambahkan {grand} baris. Total di SQLite lokal: {total}.")
    print("Lanjut: python build_analytics.py  (hitung agregat -> dorong ke Supabase)")


if __name__ == "__main__":
    main()
