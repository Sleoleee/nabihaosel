"""
SCAN: customer (yang BERTRANSAKSI 2025-2026) yang BELUM punya Kode C.
Sumber Kode C = kolom GroupName di master 'database customer TPF.xlsx'.
Membandingkan customer transaksi (SQLite lokal) vs master, lalu melaporkan yang kosong.

  python analysis/scan_customer_tanpa_c.py --master "C:\\Users\\HP 14s\\Downloads\\Data TPF\\database customer TPF.xlsx"
  # output Excel: C:\\Users\\HP 14s\\Downloads\\Data TPF\\customer_tanpa_C.xlsx  (override --out)

Read-only terhadap data; hanya MENULIS file Excel output. Tidak menyentuh DB/mapping.
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
import local_store
import openpyxl
from openpyxl.styles import Font, PatternFill

DEFAULT_OUT = r"C:\Users\HP 14s\Downloads\Data TPF\customer_tanpa_C.xlsx"
REV = "new_row_total"


def norm(v):
    return str(v).strip().upper() if v is not None else ""


def load_master(path):
    """code(UPPER) -> group_name. Juga set semua code yg ADA di master (walau group kosong)."""
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    header = next(it)
    idx = {}
    for i, h in enumerate(header):
        if h is None:
            continue
        k = str(h).strip().lower().replace(" ", "").replace("/", "").replace("_", "")
        if k in ("cardcode", "customercode", "customervendorcode"): idx["code"] = i
        elif k in ("groupname", "group"): idx["group"] = i
    if "code" not in idx or "group" not in idx:
        raise SystemExit(f"Butuh kolom CardCode & GroupName. Header: {header}")
    group = {}; present = set()
    for r in it:
        c = norm(r[idx["code"]]) if idx["code"] < len(r) else ""
        if not c:
            continue
        present.add(c)
        g = str(r[idx["group"]]).strip() if idx["group"] < len(r) and r[idx["group"]] is not None else ""
        if g:
            group[c] = g
    wb.close()
    return group, present


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--master", required=True)
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    group, present = load_master(args.master)
    conn = local_store.connect(); local_store.ensure_schema(conn)

    cust = defaultdict(lambda: {"rev": 0.0, "names": defaultdict(float), "bills": set()})
    for r in local_store.iter_rows(conn, cols=["customer_code", "customer_name", REV, "document_number", "year", "posting_date"]):
        d = r.get("posting_date") or ""; y = str(r.get("year") or "")
        yr = (y[:4] or d[:4])
        if yr not in ("2025", "2026"):
            continue
        c = norm(r.get("customer_code"))
        if not c:
            continue
        e = cust[c]; e["rev"] += float(r.get(REV) or 0)
        nm = (r.get("customer_name") or "").strip()
        if nm: e["names"][nm] += float(r.get(REV) or 0)
        if r.get("document_number"): e["bills"].add(r.get("document_number"))
    conn.close()

    total = len(cust); total_rev = sum(e["rev"] for e in cust.values()) or 1.0
    rows = []
    n_ada, n_kosong, n_notmaster = 0, 0, 0
    rev_gap = 0.0
    for c, e in cust.items():
        if c in group:
            n_ada += 1
            continue
        # belum punya Kode C: bedakan sebabnya
        if c in present:
            sebab = "ADA di master tapi GroupName KOSONG"; n_kosong += 1
        else:
            sebab = "TIDAK ADA di master"; n_notmaster += 1
        rev_gap += e["rev"]
        name = "/".join(n for n, _ in sorted(e["names"].items(), key=lambda x: -x[1])) or c
        rows.append([c, name, round(e["rev"]), len(e["bills"]), sebab])

    rows.sort(key=lambda x: -x[2])

    print(f"Total customer transaksi 2025-2026 : {total:,}")
    print(f"  sudah punya Kode C (GroupName)   : {n_ada:,}  ({n_ada/total*100:.1f}%)")
    print(f"  BELUM punya Kode C               : {len(rows):,}  ({len(rows)/total*100:.1f}%) | revenue {rev_gap/total_rev*100:.1f}%")
    print(f"      - ada di master, GroupName kosong : {n_kosong:,}")
    print(f"      - tidak ada di master            : {n_notmaster:,}")

    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Tanpa Kode C"
    ws.append(["Customer_Code", "Customer_Name", "Revenue", "Jumlah_Bills", "Sebab"])
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = PatternFill("solid", fgColor="C00000")
    for row in rows:
        ws.append(row)
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 3).number_format = "#,##0"
    for i, w in enumerate([16, 40, 16, 12, 34], 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    wb.save(args.out)
    print(f"\nExcel ditulis: {args.out}")


if __name__ == "__main__":
    main()
