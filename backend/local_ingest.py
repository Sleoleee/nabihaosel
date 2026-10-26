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
    ap.add_argument("--sheet", default=None, help="hanya proses sheet yang namanya memuat teks ini (mis. Bloomie)")
    ap.add_argument("--exclude-sheet", default=None, help="lewati sheet yang namanya memuat teks ini (mis. Bloomie)")
    ap.add_argument("--months", default=None, help="hanya bulan tertentu, mis. '1-5', '6', '7,8,9'")
    args = ap.parse_args()

    months = None
    if args.months:
        months = set()
        for part in args.months.replace(" ", "").split(","):
            if "-" in part:
                a, b = part.split("-"); months.update(range(int(a), int(b) + 1))
            elif part:
                months.add(int(part))

    def month_of(rec):
        d = str(rec.get("posting_date") or "")
        try:
            return int(d[5:7])
        except Exception:
            return None

    conn = local_store.connect()
    local_store.ensure_schema(conn)
    if args.reset:
        conn.execute("DELETE FROM transactions"); conn.commit()
        print("Tabel lokal dikosongkan (--reset).")

    grand = 0
    for path in args.files:
        if not os.path.exists(path):
            print(f"  ! lewati (tak ada): {path}"); continue
        print(f"Parsing: {path}" + (f"  [sheet~'{args.sheet}']" if args.sheet else "")
              + (f"  [exclude sheet~'{args.exclude_sheet}']" if args.exclude_sheet else "")
              + (f"  [bulan {sorted(months)}]" if months else ""))
        with open(path, "rb") as f:
            parsed = parse_excel(io.BytesIO(f.read()), only_sheet=args.sheet, exclude_sheet=args.exclude_sheet)
        if not parsed:
            print("  ! tak ada sheet transaksi valid (cek nama --sheet?)."); continue
        for year, (records, skipped) in parsed.items():
            if args.only_year is not None and year != args.only_year:
                continue
            if months is not None:
                records = [r for r in records if month_of(r) in months]
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
