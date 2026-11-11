"""
Seed tabel map_customer_c dari GroupName (Kode C) di master customer.
Satu baris per customer dgn valid_from = awal cakupan data (config.MIN_YEAR-01-01),
valid_to = NULL (masih berlaku). Ini SNAPSHOT awal; perubahan berikutnya lewat editor.

  cd backend
  python load_customer_c.py "C:\\...\\database customer TPF.xlsx"
  python load_customer_c.py --dry "C:\\...\\database customer TPF.xlsx"   # cek saja

Butuh .env (SUPABASE_URL, SUPABASE_SERVICE_KEY). Jalankan mapping_schema.sql dulu.
"""
import sys, os, argparse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
try:
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))
except Exception:
    pass

import openpyxl
import config


def norm_code(v):
    return str(v).strip() if v is not None else ""


def load_master(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {}
    for i, h in enumerate(header):
        if h is None:
            continue
        k = str(h).strip().lower().replace(" ", "").replace("/", "").replace("_", "")
        if k in ("cardcode", "customervendorcode", "customercode"): idx["code"] = i
        elif k in ("groupname", "group"): idx["group"] = i
    if "code" not in idx or "group" not in idx:
        raise SystemExit(f"Butuh kolom CardCode & GroupName. Header: {header}")
    rows = []
    for r in it:
        code = norm_code(r[idx["code"]]) if idx["code"] < len(r) else ""
        grp = norm_code(r[idx["group"]]) if idx["group"] < len(r) else ""
        if not code or not grp:
            continue
        rows.append({"customer_code": code, "kode_c": grp})
    wb.close()
    return rows


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("master")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()

    vfrom = f"{config.MIN_YEAR}-01-01"
    rows = load_master(args.master)
    # dedup by customer_code (master seharusnya unik; jaga-jaga ambil yang pertama)
    seen = {}
    for r in rows:
        seen.setdefault(r["customer_code"], r["kode_c"])
    payload = [{"customer_code": c, "kode_c": g, "valid_from": vfrom, "valid_to": None}
               for c, g in seen.items()]

    from collections import Counter
    dist = Counter(g for g in seen.values())
    print(f"{len(payload)} customer -> Kode C. valid_from={vfrom}")
    print("Sebaran Kode C (top 15):", dist.most_common(15))

    if args.dry:
        print("[DRY] tidak menulis ke DB.")
        return

    from utils.db import get_client
    db = get_client()
    CH = 500
    for i in range(0, len(payload), CH):
        db.table("map_customer_c").upsert(payload[i:i+CH], on_conflict="customer_code,valid_from").execute()
        print(f"  upsert {min(i+CH, len(payload))}/{len(payload)}")
    print("✓ Selesai seed map_customer_c.")


if __name__ == "__main__":
    main()
