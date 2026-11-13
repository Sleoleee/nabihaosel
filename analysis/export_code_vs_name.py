"""
Export Excel MURNI code vs name: untuk tiap customer_code, daftar SEMUA string nama
yang pernah menempel di data transaksi (2025-2026) apa adanya — tanpa normalisasi,
tanpa penilaian typo/varian. Hanya fakta: baris, revenue, rentang tanggal tiap nama.

  python analysis/export_code_vs_name.py
  python analysis/export_code_vs_name.py --all      # semua kode (termasuk yang 1 nama)
  python analysis/export_code_vs_name.py --out "C:\\Users\\HP 14s\\Downloads\\Data TPF\\code_vs_name.xlsx"

Default: hanya kode dengan >1 string nama berbeda.
Read-only terhadap data (hanya baca SQLite lokal), hanya MENULIS file Excel output.
"""
import sys, os, argparse
from collections import defaultdict

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend"))
import local_store
import openpyxl
from openpyxl.styles import Font, PatternFill, Alignment

DEFAULT_OUT = r"C:\Users\HP 14s\Downloads\Data TPF\code_vs_name.xlsx"
REV = "new_row_total"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=DEFAULT_OUT)
    ap.add_argument("--all", action="store_true", help="sertakan kode dengan 1 nama juga")
    args = ap.parse_args()

    conn = local_store.connect(); local_store.ensure_schema(conn)

    # (code, name) -> {rows, rev, min, max}  — name DIPAKAI APA ADANYA (hanya strip spasi tepi)
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
        a["rows"] += 1
        a["rev"] += float(r.get(REV) or 0)
        if d:
            a["min"] = d if a["min"] is None else min(a["min"], d)
            a["max"] = d if a["max"] is None else max(a["max"], d)
    conn.close()

    # kelompokkan per code
    per_code = defaultdict(list)
    for (code, name), a in agg.items():
        per_code[code].append((name, a))

    # pilih kode: default hanya yang >1 nama
    codes = sorted(per_code) if args.all else sorted(c for c, v in per_code.items() if len(v) > 1)

    # susun baris output (tiap nama 1 baris; diurut revenue desc dalam kode)
    out_rows = []
    for code in codes:
        names = sorted(per_code[code], key=lambda x: -x[1]["rev"])
        n_names = len(names)
        for name, a in names:
            out_rows.append([code, n_names, name, a["rows"], round(a["rev"]), a["min"], a["max"]])

    # tulis Excel
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Code vs Name"
    headers = ["Customer_Code", "Jumlah_Nama_di_Kode", "Customer_Name", "Jumlah_Baris",
               "Revenue", "Tanggal_Awal", "Tanggal_Akhir"]
    ws.append(headers)
    hfill = PatternFill("solid", fgColor="C00000")
    for c in ws[1]:
        c.font = Font(bold=True, color="FFFFFF"); c.fill = hfill; c.alignment = Alignment(horizontal="center")
    for row in out_rows:
        ws.append(row)
    for r in range(2, ws.max_row + 1):
        ws.cell(r, 5).number_format = "#,##0"
    widths = [16, 20, 44, 12, 16, 13, 13]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i)].width = w
    ws.freeze_panes = "A2"; ws.auto_filter.ref = ws.dimensions

    ws2 = wb.create_sheet("Ringkasan")
    total_codes = len(per_code)
    multi = sum(1 for v in per_code.values() if len(v) > 1)
    ws2.append(["Total kode (punya transaksi 2025-2026)", total_codes])
    ws2.append(["Kode dengan >1 string nama", multi])
    ws2.append(["Kode dengan tepat 1 nama", total_codes - multi])
    ws2.append(["Mode output", "SEMUA kode" if args.all else "hanya kode >1 nama"])
    ws2.append(["Catatan", "Nama apa adanya (tanpa normalisasi). Beda spasi/huruf besar/typo dihitung sebagai nama berbeda."])
    for c in ws2["A"]:
        c.font = Font(bold=True)

    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    wb.save(args.out)
    print(f"OK. {len(codes)} kode ditulis ({len(out_rows)} baris nama). "
          f"Dari total {total_codes} kode, {multi} punya >1 string nama.\n  {args.out}")


if __name__ == "__main__":
    main()
