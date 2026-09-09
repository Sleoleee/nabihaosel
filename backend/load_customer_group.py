"""
Muat mapping client -> group induk dari Excel ke tabel customer_group.
Ringan (puluhan baris) — tidak menyentuh transaksi, aman & cepat.

  cd backend && source venv/bin/activate
  python load_customer_group.py "/path/ke/Customer_Group_Per_Tim_Sales.xlsx"
  # opsi --dry : hanya tampilkan ringkasan, tidak menulis
  # opsi --replace : kosongkan tabel dulu (hapus mapping lama) sebelum isi baru

File wajib punya kolom: Code Cust, Cust Name, Sales Employee, Group.
"""
import sys, os
import openpyxl

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

COLMAP = {"code cust": "customer_code", "cust name": "customer_name",
          "sales employee": "sales_employee", "group": "group_name"}


def load(path):
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {}
    for i, h in enumerate(header):
        if h is None:
            continue
        k = str(h).strip().lower()
        if k in COLMAP:
            idx[COLMAP[k]] = i
    for need in ("customer_code", "group_name"):
        if need not in idx:
            raise SystemExit(f"Kolom wajib tak ditemukan: {need}. Header: {header}")
    rows = []
    for r in it:
        code = r[idx["customer_code"]]
        if not code or str(code).strip() == "":
            continue
        rows.append({
            "customer_code": str(code).strip(),
            "group_name": (str(r[idx["group_name"]]).strip() if idx.get("group_name") is not None and r[idx["group_name"]] else None),
            "sales_employee": (str(r[idx["sales_employee"]]).strip() if "sales_employee" in idx and r[idx["sales_employee"]] else None),
            "customer_name": (str(r[idx["customer_name"]]).strip() if "customer_name" in idx and r[idx["customer_name"]] else None),
        })
    return rows


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not args:
        raise SystemExit("Pakai: python load_customer_group.py <file.xlsx> [--dry] [--replace]")
    rows = load(args[0])
    from collections import Counter
    grp = Counter(r["group_name"] for r in rows)
    print(f"{len(rows)} customer, {len(grp)} group.")
    for g, n in grp.most_common():
        print(f"  {g:18} {n}")
    if "--dry" in sys.argv:
        print("(--dry) tidak menulis.")
        return
    from utils.db import get_client
    db = get_client()
    if "--replace" in sys.argv:
        try:
            db.table("customer_group").delete().neq("customer_code", "___none___").execute()
            print("Tabel dikosongkan (--replace).")
        except Exception as e:
            print("Gagal replace:", str(e)[:80])
    for i in range(0, len(rows), 500):
        db.table("customer_group").upsert(rows[i:i+500], on_conflict="customer_code").execute()
    print("✓ customer_group terisi.")


if __name__ == "__main__":
    main()
