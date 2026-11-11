"""
Export Excel: customer_code yang punya NAMA GANDA di data transaksi (2025-2026),
beserta revenue & rentang tanggal pemakaian tiap nama.

  python analysis/export_code_name_dupes.py
  python analysis/export_code_name_dupes.py --out "C:\\Users\\HP 14s\\Downloads\\Data TPF\\nama_ganda.xlsx"

Default output: C:\\Users\\HP 14s\\Downloads\\Data TPF\\customer_code_nama_ganda.xlsx
Read-only terhadap data (hanya baca SQLite lokal), hanya MENULIS file Excel output.
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
import local_store
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

DEFAULT_OUT = r"C:\Users\HP 14s\Downloads\Data TPF\customer_code_nama_ganda.xlsx"
REV = "new_row_total"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    args = ap.parse_args()

    conn = local_store.connect(); local_store.ensure_schema(conn)

    # (code, name) -> {rows, rev, min, max}
    agg = defaultdict(lambda: {"rows": 0, "rev": 0.0, "min": None, "max": None})
    for r in local_store.iter_rows(conn, cols=["customer_code", "customer_name", REV, "posting_date", "year"]):
        y = str(r.get("year") or "")
        d = r.get("posting_date") or ""
        yr = y[:4] if y else (d[:4] if d else "")
        if yr not in ("2025", "2026"):
            continue
        code = (r.get("customer_code") or "").strip()
        name = (r.get("customer_name") or "").strip()
        if not code:
            continue
        a = agg[(code, name)]
        a["rows"] += 1; a["rev"] += float(r.get(REV) or 0)
        if d:
            a["min"] = d if a["min"] is None else min(a["min"], d)
            a["max"] = d if a["max"] is None else max(a["max"], d)
    conn.close()

    # kelompokkan per code, hanya yang punya >1 nama
    per_code = defaultdict(list)
    for (code, name), a in agg.items():
        per_code[code].append((name, a))
    dup = {c: v for c, v in per_code.items() if len(v) > 1}

    # susun baris output
    out_rows = []
    for code in sorted(dup):
        names = sorted(dup[code], key=lambda x: -x[1]["rev"])
        tot = sum(a["rev"] for _, a in names) or 1.0
        for rank, (name, a) in enumerate(names):
            share = a["rev"] / tot * 100
            if rank == 0:
                status = "NAMA UTAMA (dipakai)"
            elif share < 5:
                status = "KANDIDAT SALAH / TYPO"
            else:
                status = "VARIAN NAMA"
            out_rows.append([code, name, a["rows"], round(a["rev"]), round(share, 1),
                             a["min"], a["max"], "Y" if rank == 0 else "", status])

    # tulis Excel
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Nama Ganda"
    headers = ["Customer_Code", "Customer_Name", "Jumlah_Baris", "Revenue", "Pct_Revenue_dlm_Kode",
               "Tanggal_Awal", "Tanggal_Akhir", "Nama_Dominan", "Status"]
    ws.append(headers)
    hfill = PatternFill("solid", fgColor="C00000")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = hfill; c.alignment = Alignment(horizontal="center")
    for row in out_rows:
        ws.append(row)
    # format angka revenue
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 4).number_format = "#,##0"
    widths = [16, 42, 12, 16, 18, 13, 13, 12, 22]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

    # sheet ringkas
    ws2 = wb.create_sheet("Ringkasan")
    ws2.append(["Total kode dgn nama ganda", len(dup)])
    ws2.append(["Total baris nama (semua varian)", len(out_rows)])
    ws2.append(["Catatan", "Dashboard pakai 'baris terakhir menang' -> perlu diganti ke Nama Dominan."])
    for c in ws2["A"]:
        c.font = Font(bold=True)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    wb.save(args.out)
    print(f"OK. {len(dup)} kode nama-ganda, {len(out_rows)} baris. Ditulis ke:\n  {args.out}")


if __name__ == "__main__":
    main()
