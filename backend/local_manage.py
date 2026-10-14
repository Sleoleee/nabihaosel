"""
Kelola data mentah LOKAL (SQLite). Menggantikan fitur hapus/cek di dashboard
yang dulu menyentuh Supabase (kini Supabase hanya agregat).

  python local_manage.py --status                         # cakupan per channel & tahun
  python local_manage.py --delete --channel BLOOMIE --year 2026
  python local_manage.py --delete --all --year 2026       # hapus overall tahun 2026
  python local_manage.py --delete --channel K25 --from 2026-01-01 --to 2026-06-30

Setelah menghapus, jalankan build_analytics.py agar agregat di Supabase sinkron.
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config
import local_store


def status(conn):
    rows = local_store.iter_rows(conn, cols=["branch", "posting_date", "document_number", "year"])
    per = defaultdict(lambda: {"docs": set(), "min": None, "max": None})
    for r in rows:
        ch = config.branch_group(r.get("branch"))
        e = per[ch]
        if r.get("document_number"): e["docs"].add(r["document_number"])
        d = r.get("posting_date")
        if d:
            e["min"] = d if e["min"] is None else min(e["min"], d)
            e["max"] = d if e["max"] is None else max(e["max"], d)
    print(f'{"Channel":16} {"Nota":>8}  {"Awal":>12}  {"Akhir":>12}')
    print("-" * 54)
    for ch in config.BRANCH_GROUP_ORDER:
        e = per.get(ch)
        if e:
            print(f'{ch:16} {len(e["docs"]):>8}  {str(e["min"]):>12}  {str(e["max"]):>12}')
        else:
            print(f'{ch:16} {"-":>8}  {"-":>12}  {"-":>12}')


def delete(conn, channel, year, dfrom, dto, allch):
    clauses, params = [], []
    if not allch:
        cw = local_store.channel_where(channel)
        if cw is None:
            raise SystemExit(f"Channel '{channel}' tak bisa ditarget (OTHER CHANNEL).")
        clauses.append(cw[0]); params += cw[1]
    if year:
        clauses.append("CAST(year AS INTEGER) = ?"); params.append(int(year))
    if dfrom:
        clauses.append("posting_date >= ?"); params.append(dfrom)
    if dto:
        clauses.append("posting_date <= ?"); params.append(dto)
    if not clauses:
        raise SystemExit("Beri minimal satu filter (channel/tahun/tanggal).")
    where = " AND ".join(clauses)
    n = local_store.count(conn, where, params)
    print(f"Akan menghapus {n} baris (WHERE {where}).")
    if input("Ketik 'HAPUS' untuk konfirmasi: ").strip() != "HAPUS":
        print("Dibatalkan."); return
    conn.execute(f"DELETE FROM transactions WHERE {where}", params); conn.commit()
    print(f"✓ {n} baris dihapus. Jalankan build_analytics.py agar agregat sinkron.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--delete", action="store_true")
    ap.add_argument("--channel", default=None)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--year", type=int, default=None)
    ap.add_argument("--from", dest="dfrom", default=None)
    ap.add_argument("--to", dest="dto", default=None)
    args = ap.parse_args()

    conn = local_store.connect(); local_store.ensure_schema(conn)
    if args.status:
        status(conn)
    elif args.delete:
        delete(conn, args.channel, args.year, args.dfrom, args.dto, args.all)
    else:
        print("Pakai --status atau --delete. Lihat --help.")
    conn.close()


if __name__ == "__main__":
    main()
