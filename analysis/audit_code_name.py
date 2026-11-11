"""
AUDIT read-only: konsistensi Kode Customer -> Nama di data transaksi (SQLite lokal).
Melacak kasus seperti: satu kode punya >1 nama berbeda (sumber nama 'salah' di dashboard).

  python analysis/audit_code_name.py --code JBA-00086      # detail satu kode
  python analysis/audit_code_name.py --name "NIDA BOGOR"   # kode apa saja yg pakai nama ini
  python analysis/audit_code_name.py                       # statistik global ambiguitas

Tidak menyentuh Supabase. Baca data_local/transactions.db.
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
import local_store
import config


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--code", default=None)
    ap.add_argument("--name", default=None)
    args = ap.parse_args()

    conn = local_store.connect(); local_store.ensure_schema(conn)
    rev_col = "new_row_total"

    if args.code:
        code = args.code.strip().upper()
        agg = defaultdict(lambda: {"rows": 0, "rev": 0.0, "min": None, "max": None})
        for r in local_store.iter_rows(conn, cols=["customer_code", "customer_name", rev_col, "posting_date"]):
            if (r.get("customer_code") or "").strip().upper() != code:
                continue
            nm = (r.get("customer_name") or "").strip()
            a = agg[nm]; a["rows"] += 1; a["rev"] += float(r.get(rev_col) or 0)
            d = r.get("posting_date") or ""
            if d:
                a["min"] = d if a["min"] is None else min(a["min"], d)
                a["max"] = d if a["max"] is None else max(a["max"], d)
        print(f"Kode {code}: {len(agg)} nama berbeda")
        for nm, a in sorted(agg.items(), key=lambda x: -x[1]["rev"]):
            print(f"  '{nm}'  | {a['rows']:>5} baris | rev {a['rev']:>14,.0f} | {a['min']} s/d {a['max']}")
        print("\nCatatan: dashboard memakai 'baris terakhir menang' -> nama bisa ikut yg terakhir diproses.")

    elif args.name:
        want = args.name.strip().lower()
        codes = defaultdict(lambda: {"rows": 0, "rev": 0.0})
        for r in local_store.iter_rows(conn, cols=["customer_code", "customer_name", rev_col]):
            if (r.get("customer_name") or "").strip().lower() == want:
                c = (r.get("customer_code") or "").strip()
                codes[c]["rows"] += 1; codes[c]["rev"] += float(r.get(rev_col) or 0)
        print(f"Nama '{args.name}': dipakai {len(codes)} kode berbeda")
        for c, a in sorted(codes.items(), key=lambda x: -x[1]["rev"]):
            print(f"  {c:16} | {a['rows']:>5} baris | rev {a['rev']:>14,.0f}")

    else:
        names_per_code = defaultdict(set)
        codes_per_name = defaultdict(set)
        for r in local_store.iter_rows(conn, cols=["customer_code", "customer_name"]):
            c = (r.get("customer_code") or "").strip()
            n = (r.get("customer_name") or "").strip()
            if c:
                names_per_code[c].add(n)
            if n:
                codes_per_name[n].add(c)
        multi_name = {c: ns for c, ns in names_per_code.items() if len(ns) > 1}
        multi_code = {n: cs for n, cs in codes_per_name.items() if len(cs) > 1}
        print(f"Total kode unik          : {len(names_per_code):,}")
        print(f"Kode dgn >1 NAMA berbeda : {len(multi_name):,}  <- sumber nama 'salah' di dashboard")
        print(f"Nama dipakai >1 KODE     : {len(multi_code):,}")
        print("\nContoh kode dgn banyak nama (top 15 by jumlah nama):")
        for c, ns in sorted(multi_name.items(), key=lambda x: -len(x[1]))[:15]:
            print(f"  {c:16} {len(ns)} nama: {sorted(ns)[:4]}")

    conn.close()


if __name__ == "__main__":
    main()
